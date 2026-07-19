"use client";

import api from "@/lib/axios";
import { getNetworkHint } from "@/lib/network";
import { CHUNK_RETRIES } from "@/constants/upload";
import { uploadChunkToCloudinary } from "@/lib/cloudinaryUpload";
import { generateCloudinaryFileChunks } from "@/lib/cloudinaryChunkProcess";
import useFileUploadChunkedBase from "./useFileUploadChunkedBase";
import { ChunkSender, InitRequest } from "@/types/uploadStrategy";
import {
  CloudinaryChunkUploadResult,
  CloudinarySigningMeta,
} from "@/types/cloudinary";
import { FileChunk } from "@/types/file";

/**
 * Talks to our backend's /uploads/cloudinary/init instead of /uploads/init —
 * dedupes by file hash the same way, but the response also carries the
 * Cloudinary signing material (returned via `meta`, read back off
 * `session.meta` by the ChunkSender below) needed to POST chunks straight
 * to Cloudinary.
 */
const cloudinaryInitRequest: InitRequest = async (session, totalChunks) => {
  const response = await api.post("/uploads/cloudinary/init", {
    fileHash: session.fileHash,
    fileName: session.file.name,
    fileSize: session.file.size,
    totalChunks,
  });

  const initData = response.data;
  if (!initData.success)
    throw new Error("Failed to initialize Cloudinary upload");

  const {
    status,
    uploadId,
    uploadedChunks,
    uniqueUploadId,
    cloudinary,
    deduplicated,
  } = initData.data;

  return {
    status,
    uploadId,
    uploadedChunks: uploadedChunks ?? [],
    meta: deduplicated
      ? undefined
      : ({
          cloudName: cloudinary.cloudName,
          apiKey: cloudinary.apiKey,
          uploadUrl: cloudinary.uploadUrl,
          uniqueUploadId,
          publicId: cloudinary.publicId,
          timestamp: cloudinary.timestamp,
          signature: cloudinary.signature,
        } satisfies CloudinarySigningMeta),
  };
};

// Records a chunk as confirmed with our backend. For middle chunks this is
// best-effort bookkeeping (Cloudinary already has the bytes either way); for
// the last chunk it is load-bearing — see the call sites below.
const confirmChunkOnServer = async (
  uploadId: string,
  chunk: FileChunk,
  result: CloudinaryChunkUploadResult,
  isLast: boolean,
) => {
  await api.post(`/uploads/cloudinary/${uploadId}/chunk`, {
    chunkIndex: chunk.index,
    byteStart: chunk.start,
    byteEnd: chunk.end,
    done: isLast,
    ...(isLast
      ? {
          cloudinaryAsset: {
            publicId: result.public_id,
            secureUrl: result.secure_url,
            bytes: result.bytes,
            format: result.format,
            etag: result.etag,
          },
        }
      : {}),
  });
};

const confirmChunkBestEffort = async (
  uploadId: string,
  chunk: FileChunk,
  result: CloudinaryChunkUploadResult,
  appendLog: (line: string) => void,
) => {
  try {
    await confirmChunkOnServer(uploadId, chunk, result, false);
  } catch {
    appendLog(
      `[upload] chunk ${chunk.index} landed on Cloudinary but our bookkeeping confirm failed — continuing (resume precision may degrade)`,
    );
  }
};

const isAbortError = (err: unknown) =>
  err instanceof DOMException && err.name === "AbortError";

/**
 * Sends the remaining chunks to Cloudinary directly, honoring Cloudinary's
 * chunked-upload ordering constraint (first chunk must land before any
 * other; everything but the last chunk can go in parallel) while reusing
 * the same worker-pool concurrency model as the disk-based strategy for the
 * middle chunks.
 */
const sendChunksWithCloudinaryWorkerPool: ChunkSender = async ({
  session,
  uploadId,
  chunks,
  controller,
  appendLog,
  reportChunkUploaded,
  reportLastChunkClaimed,
}) => {
  const meta = session.meta as CloudinarySigningMeta | undefined;
  if (!meta) {
    return {
      status: "error",
      error: new Error("Missing Cloudinary signing metadata"),
    };
  }

  if (chunks.length === 0) return { status: "completed" };

  const totalFileSize = session.file.size;
  const totalChunks = session.totalChunks;

  const hasFirst = chunks[0].index === 0;
  const hasLast = chunks[chunks.length - 1].index === totalChunks - 1;
  const singleChunk = hasFirst && hasLast && chunks.length === 1;

  const retryLog = (chunk: FileChunk) => (attempt: number, delayMs: number) =>
    appendLog(
      `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${CHUNK_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
    );

  let firstError: Error | null = null;
  let pausedAtCursor: number | null = null;

  // Phase 1 — first chunk must land before anything else.
  if (hasFirst && !singleChunk) {
    if (session.isPaused) {
      pausedAtCursor = 0;
    } else {
      const chunk = chunks[0];
      try {
        const result = await uploadChunkToCloudinary(
          chunk,
          totalFileSize,
          meta,
          controller.signal,
          retryLog(chunk),
        );
        await confirmChunkBestEffort(uploadId, chunk, result, appendLog);
        reportChunkUploaded(chunk);
      } catch (err) {
        if (isAbortError(err)) return { status: "cancelled" };
        firstError =
          err instanceof Error ? err : new Error("Unknown upload error");
      }
    }
  }

  // Phase 2 — middle chunks, concurrent worker pool (skipped entirely for a
  // single-chunk upload, where that one chunk is handled as "the last chunk"
  // in phase 3 below).
  const middleStart = singleChunk ? 0 : hasFirst ? 1 : 0;
  const middleEnd = singleChunk
    ? 0
    : hasLast
      ? chunks.length - 1
      : chunks.length;

  if (!firstError && pausedAtCursor === null && middleEnd > middleStart) {
    const concurrency = getNetworkHint().concurrency;
    let cursor = middleStart;

    const worker = async () => {
      while (cursor < middleEnd) {
        if (firstError || pausedAtCursor !== null) return;

        if (session.isPaused) {
          pausedAtCursor = cursor;
          return;
        }

        const chunk = chunks[cursor++];
        try {
          const result = await uploadChunkToCloudinary(
            chunk,
            totalFileSize,
            meta,
            controller.signal,
            retryLog(chunk),
          );
          await confirmChunkBestEffort(uploadId, chunk, result, appendLog);
          reportChunkUploaded(chunk);
        } catch (err) {
          if (isAbortError(err)) return;
          firstError =
            err instanceof Error ? err : new Error("Unknown upload error");
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  if (controller.signal.aborted) return { status: "cancelled" };
  if (firstError) return { status: "error", error: firstError };

  if (pausedAtCursor !== null) {
    session.remainingChunks = chunks.slice(pausedAtCursor);
    return { status: "paused" };
  }

  // Phase 3 — last chunk, sent only after everything else is confirmed.
  const lastIndexInChunks = singleChunk
    ? 0
    : hasLast
      ? chunks.length - 1
      : null;
  if (lastIndexInChunks === null) return { status: "completed" };

  if (session.isPaused) {
    session.remainingChunks = chunks.slice(lastIndexInChunks);
    return { status: "paused" };
  }

  reportLastChunkClaimed();
  const lastChunk = chunks[lastIndexInChunks];

  try {
    const result = await uploadChunkToCloudinary(
      lastChunk,
      totalFileSize,
      meta,
      controller.signal,
      retryLog(lastChunk),
    );

    // Load-bearing, unlike the best-effort confirms above: if this fails,
    // Cloudinary has every byte but our backend never records COMPLETED, so
    // the result must be reported as an error.
    await confirmChunkOnServer(uploadId, lastChunk, result, true);
    reportChunkUploaded(lastChunk);
  } catch (err) {
    if (isAbortError(err)) return { status: "cancelled" };
    return {
      status: "error",
      error: err instanceof Error ? err : new Error("Unknown upload error"),
    };
  }

  return { status: "completed" };
};

/**
 * Cloudinary, worker-pool-strategy file upload hook. Chunks are sent
 * directly from the browser to Cloudinary (not through our backend) — see
 * useFileUploadChunkedBase for the shared hash/init/resume/pause/cancel
 * flow, and sendChunksWithCloudinaryWorkerPool above for the ordering-aware
 * scheduler this strategy needs.
 */
const useFileUploadCloudinaryWorkerPool = () =>
  useFileUploadChunkedBase({
    strategy: "cloudinary-worker-pool",
    sendChunks: sendChunksWithCloudinaryWorkerPool,
    initRequest: cloudinaryInitRequest,
    generateChunks: generateCloudinaryFileChunks,
  });

export default useFileUploadCloudinaryWorkerPool;

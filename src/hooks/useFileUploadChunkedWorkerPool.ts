"use client";

import { uploadChunk } from "@/lib/uploadChunk";
import { CHUNK_RETRIES } from "@/constants/upload";
import { getNetworkHint } from "@/lib/network";
import useFileUploadChunkedBase from "./useFileUploadChunkedBase";
import { ChunkSender } from "@/types/uploadStrategy";

/**
 * Sends the remaining chunks to the server CONCURRENTLY, using a small pool
 * of workers sized to the detected connection quality.
 *
 * All workers share one "next chunk index" cursor; each worker claims its
 * chunk with a synchronous read-then-increment (JS is single-threaded, so
 * two workers can never claim the same index).
 */
const sendChunksWithWorkerPool: ChunkSender = async ({
  session,
  uploadId,
  chunks,
  controller,
  appendLog,
  reportChunkUploaded,
  reportLastChunkClaimed,
}) => {
  const concurrency = getNetworkHint().concurrency;
  let cursor = 0;
  let firstError: Error | null = null;
  let pausedAtCursor: number | null = null;

  const worker = async () => {
    while (cursor < chunks.length) {
      if (firstError || pausedAtCursor !== null) return;

      // The user asked to pause. Save whatever is left and stop — do not
      // touch the server or the chunk list any further.
      if (session.isPaused) {
        pausedAtCursor = cursor;
        return;
      }

      const chunk = chunks[cursor++];
      const isLastChunk = cursor >= chunks.length;
      if (isLastChunk) reportLastChunkClaimed();

      try {
        await uploadChunk(chunk, uploadId, controller.signal, (attempt, delayMs) =>
          appendLog(
            `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${CHUNK_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
          ),
        );
      } catch (err) {
        const wasCancelled =
          err instanceof DOMException && err.name === "AbortError";
        if (wasCancelled) return;

        firstError =
          err instanceof Error ? err : new Error("Unknown upload error");
        return;
      }

      reportChunkUploaded(chunk);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (controller.signal.aborted) return { status: "cancelled" };
  if (firstError) return { status: "error", error: firstError };

  if (pausedAtCursor !== null) {
    session.remainingChunks = chunks.slice(pausedAtCursor);
    return { status: "paused" };
  }

  return { status: "completed" };
};

/**
 * Chunked, worker-pool-strategy file upload hook. See useFileUploadChunkedBase
 * for the shared hash/init/resume/pause/cancel flow — this file only owns
 * how chunks are sent: concurrently, through a small worker pool.
 */
const useFileUploadChunkedWorkerPool = () =>
  useFileUploadChunkedBase({
    strategy: "worker-pool",
    sendChunks: sendChunksWithWorkerPool,
  });

export default useFileUploadChunkedWorkerPool;

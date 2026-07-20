"use client";

import { uploadChunk } from "@/lib/uploadChunkService";
import { DEFAULT_RETRIES } from "@/constants";
import { getNetworkHint } from "@/lib/networkService";
import useFileUploadChunkedBase from "./useFileUploadChunkedBase";
import { UploadChunk } from "@/types/upload";

const sendChunksWithWorkerPool: UploadChunk = async ({
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

      if (session.isPaused) {
        pausedAtCursor = cursor;
        return;
      }

      const chunk = chunks[cursor++];
      const isLastChunk = cursor >= chunks.length;
      if (isLastChunk) reportLastChunkClaimed();

      try {
        await uploadChunk(
          chunk,
          uploadId,
          controller.signal,
          (attempt, delayMs) =>
            appendLog(
              `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${DEFAULT_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
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

const useFileUploadChunkedWorkerPool = () =>
  useFileUploadChunkedBase({
    strategy: "worker-pool",
    onUploadChunks: sendChunksWithWorkerPool,
  });

export default useFileUploadChunkedWorkerPool;

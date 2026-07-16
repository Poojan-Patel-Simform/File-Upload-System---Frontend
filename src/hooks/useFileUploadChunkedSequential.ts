"use client";

import { uploadChunk } from "@/lib/uploadChunk";
import { CHUNK_RETRIES } from "@/constants/upload";
import useFileUploadChunkedBase from "./useFileUploadChunkedBase";
import { ChunkSender } from "@/types/uploadStrategy";

/**
 * Sends the remaining chunks to the server ONE AT A TIME, in order,
 * stopping as soon as the file is paused, cancelled, or a chunk fails
 * permanently.
 */
const sendChunksSequentially: ChunkSender = async ({
  session,
  uploadId,
  chunks,
  controller,
  appendLog,
  reportChunkUploaded,
  reportLastChunkClaimed,
}) => {
  for (let i = 0; i < chunks.length; i++) {
    // The user asked to pause. Save whatever is left and stop — do not
    // touch the server or the chunk list any further.
    if (session.isPaused) {
      session.remainingChunks = chunks.slice(i);
      return { status: "paused" };
    }

    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;
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
      if (wasCancelled) return { status: "cancelled" };

      return {
        status: "error",
        error: err instanceof Error ? err : new Error("Unknown error"),
      };
    }

    reportChunkUploaded(chunk);
  }

  return { status: "completed" };
};

/**
 * Chunked, sequential-strategy file upload hook. See useFileUploadChunkedBase
 * for the shared hash/init/resume/pause/cancel flow — this file only owns
 * how chunks are sent: one at a time, in order.
 */
const useFileUploadChunkedSequential = () =>
  useFileUploadChunkedBase({
    strategy: "sequential",
    sendChunks: sendChunksSequentially,
  });

export default useFileUploadChunkedSequential;

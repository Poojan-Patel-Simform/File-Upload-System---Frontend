"use client";

import { uploadChunk } from "@/lib/uploadChunkService";
import { DEFAULT_RETRIES } from "@/constants";
import useFileUploadChunkedBase from "./useFileUploadChunkedBase";
import { UploadChunk } from "@/types/upload";

const sendChunksSequentially: UploadChunk = async ({
  session,
  uploadId,
  chunks,
  controller,
  appendLog,
  reportChunkUploaded,
  reportLastChunkClaimed,
}) => {
  for (let i = 0; i < chunks.length; i++) {
    if (session.isPaused) {
      session.remainingChunks = chunks.slice(i);
      return { status: "paused" };
    }

    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;
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

const useFileUploadChunkedSequential = () =>
  useFileUploadChunkedBase({
    strategy: "sequential",
    onUploadChunks: sendChunksSequentially,
  });

export default useFileUploadChunkedSequential;

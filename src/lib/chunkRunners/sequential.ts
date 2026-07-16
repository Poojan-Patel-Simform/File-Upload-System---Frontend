import { ChunkRunner } from "@/types/chunk";

/**
 * Sends chunks to the server one at a time, in order. Simple and
 * predictable — pause takes effect immediately between chunks — at the cost
 * of not using all available bandwidth.
 */
export const runChunksSequentially: ChunkRunner = async ({
  chunks,
  uploadId,
  signal,
  isPauseRequested,
  uploadChunk,
  onChunkUploaded,
  onChunkRetry,
  onLastChunkClaimed,
}) => {
  for (let i = 0; i < chunks.length; i++) {
    if (isPauseRequested()) {
      return { outcome: "paused", remainingChunks: chunks.slice(i) };
    }

    const chunk = chunks[i];
    const isLastChunk = i === chunks.length - 1;
    if (isLastChunk) onLastChunkClaimed();

    try {
      await uploadChunk(chunk, uploadId, signal, (attempt, delayMs) =>
        onChunkRetry(chunk, attempt, delayMs),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { outcome: "cancelled" };
      }
      return {
        outcome: "error",
        error: err instanceof Error ? err : new Error("Unknown upload error"),
      };
    }

    onChunkUploaded(chunk);
  }

  return { outcome: "completed" };
};

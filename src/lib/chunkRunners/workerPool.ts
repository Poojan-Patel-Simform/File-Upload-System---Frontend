import { getNetworkHint } from "@/lib/network";
import { ChunkRunner } from "@/types/chunk";

/**
 * Sends chunks via a small pool of concurrent workers, sized to the
 * detected connection quality. All workers share one "next chunk index"
 * cursor; each worker claims its chunk with a synchronous read-then-increment
 * (JS is single-threaded, so two workers can never claim the same index).
 */
export const runChunksInWorkerPool: ChunkRunner = async ({
  chunks,
  uploadId,
  signal,
  isPauseRequested,
  uploadChunk,
  onChunkUploaded,
  onChunkRetry,
  onLastChunkClaimed,
}) => {
  const concurrency = getNetworkHint().concurrency;

  let cursor = 0;
  let firstError: Error | null = null;
  let pausedAtCursor: number | null = null;

  const worker = async () => {
    while (cursor < chunks.length) {
      if (firstError || pausedAtCursor !== null) return;

      if (isPauseRequested()) {
        pausedAtCursor = cursor;
        return;
      }

      const chunk = chunks[cursor++];
      const isLastChunk = cursor >= chunks.length;
      if (isLastChunk) onLastChunkClaimed();

      try {
        await uploadChunk(chunk, uploadId, signal, (attempt, delayMs) =>
          onChunkRetry(chunk, attempt, delayMs),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        firstError =
          err instanceof Error ? err : new Error("Unknown upload error");
        return;
      }

      onChunkUploaded(chunk);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (signal.aborted) return { outcome: "cancelled" };
  if (firstError) return { outcome: "error", error: firstError };
  if (pausedAtCursor !== null) {
    return { outcome: "paused", remainingChunks: chunks.slice(pausedAtCursor) };
  }

  return { outcome: "completed" };
};

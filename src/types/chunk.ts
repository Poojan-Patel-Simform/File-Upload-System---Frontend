import { FileChunk } from "@/types/file";

export type ChunkList = FileChunk[];

/**
 * Sends one chunk to the server (hash + retry). Same function is used by
 * every strategy — see src/lib/uploadChunk.ts.
 */
export type UploadChunkFn = (
  chunk: FileChunk,
  uploadId: string,
  signal: AbortSignal,
  onRetry: (attempt: number, delayMs: number) => void,
) => Promise<void>;

export type ChunkRunnerInput = {
  /** Chunks still left to send (already-uploaded ones are filtered out before this). */
  chunks: ChunkList;
  uploadId: string;
  signal: AbortSignal;
  /** Polled between chunks — becomes true once the user asks to pause. */
  isPauseRequested: () => boolean;
  uploadChunk: UploadChunkFn;
  /** Fired every time a chunk is confirmed uploaded. */
  onChunkUploaded: (chunk: FileChunk) => void;
  /** Fired when a chunk attempt fails and is about to be retried. */
  onChunkRetry: (chunk: FileChunk, attempt: number, delayMs: number) => void;
  /** Fired once, right when the last chunk has been claimed. */
  onLastChunkClaimed: () => void;
};

export type ChunkRunnerResult =
  | { outcome: "completed" }
  | { outcome: "paused"; remainingChunks: ChunkList }
  | { outcome: "cancelled" }
  | { outcome: "error"; error: Error };

/**
 * A chunk runner decides *the order/concurrency* chunks are sent in. It owns
 * nothing else — no React state, no status updates, no logging — that all
 * stays in the hook that calls it. Two runners exist: sequential.ts (one
 * chunk at a time) and workerPool.ts (a few chunks at a time).
 */
export type ChunkRunner = (
  input: ChunkRunnerInput,
) => Promise<ChunkRunnerResult>;

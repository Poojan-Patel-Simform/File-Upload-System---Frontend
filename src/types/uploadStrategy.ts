import { FileChunk } from "@/types/file";
import { ResumableUploadRecord } from "@/types/resume";

/**
 * Everything the hook needs to remember about ONE file while it is
 * uploading. There is exactly one UploadSession per file id, kept in
 * `sessionsRef` — this is the only place per-file upload state lives
 * outside of React state, so there is nothing else to keep in sync.
 */
export type UploadSession = {
  file: File;
  fileHash: string | null;
  uploadId: string | null;
  controller: AbortController | null;
  isPaused: boolean;
  remainingChunks: FileChunk[];
  uploadedCount: number;
  totalChunks: number;
};

/**
 * The outcome of a strategy's attempt to send the remaining chunks — the
 * base hook maps each variant to the matching status/log/cleanup, so a
 * strategy only has to report what happened, not how to react to it.
 */
export type SendChunksResult =
  | { status: "completed" }
  | { status: "paused" }
  | { status: "cancelled" }
  | { status: "error"; error: Error };

/**
 * Everything a strategy needs to drive its chunk loop, without having to
 * know about React state, progress %, or resume snapshots.
 */
export type ChunkSenderContext = {
  session: UploadSession;
  uploadId: string;
  chunks: FileChunk[];
  controller: AbortController;
  appendLog: (line: string) => void;
  reportChunkUploaded: (chunk: FileChunk) => void;
  reportLastChunkClaimed: () => void;
};

export type ChunkSender = (ctx: ChunkSenderContext) => Promise<SendChunksResult>;

export type UseFileUploadChunkedBaseOptions = {
  strategy: ResumableUploadRecord["strategy"];
  sendChunks: ChunkSender;
};

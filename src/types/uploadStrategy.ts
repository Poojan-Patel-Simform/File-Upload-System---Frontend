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
  // Strategy-specific data returned by a custom InitRequest (e.g. Cloudinary
  // signing material). Unset for strategies that don't provide one.
  meta?: Record<string, unknown>;
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

/**
 * The outcome of asking the server to init/resume an upload session — the
 * default implementation talks to `/uploads/init`, but a strategy can
 * override this (via `initRequest`) to talk to a different endpoint and
 * stash extra data (e.g. Cloudinary signing material) in `meta` for its
 * ChunkSender to read back off `session.meta`.
 */
export type InitRequestResult = {
  status: string;
  uploadId: string;
  uploadedChunks?: number[];
  meta?: Record<string, unknown>;
};

export type InitRequest = (
  session: UploadSession,
  totalChunks: number,
) => Promise<InitRequestResult>;

export type UseFileUploadChunkedBaseOptions = {
  strategy: ResumableUploadRecord["strategy"];
  sendChunks: ChunkSender;
  // Both optional and additive — omitting them reproduces today's exact
  // behavior (POST /uploads/init, 1MB-50MB chunk-size tiers).
  initRequest?: InitRequest;
  generateChunks?: (file: File) => FileChunk[];
};

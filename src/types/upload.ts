import { FileChunk } from "@/types/file";

export type UploadRecord = {
  fileHash: string;
  fileName: string;
  fileSize: number;
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number;
  strategy: string;
  updatedAt: number;
};

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

export type UploadChunkResult =
  | { status: "completed" }
  | { status: "paused" }
  | { status: "cancelled" }
  | { status: "error"; error: Error };

export type UploadChunkArgs = {
  session: UploadSession;
  uploadId: string;
  chunks: FileChunk[];
  controller: AbortController;
  appendLog: (line: string) => void;
  reportChunkUploaded: (chunk: FileChunk) => void;
  reportLastChunkClaimed: () => void;
};

export type UploadChunk = (ctx: UploadChunkArgs) => Promise<UploadChunkResult>;

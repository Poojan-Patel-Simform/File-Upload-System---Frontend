import { FileChunk } from "./file";

export type CloudinarySignResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

export type CloudinarySignApiResponse =
  | { success: true; data: CloudinarySignResponse }
  | { success: false; message: string; error: string };

// Cloudinary's own response body for a chunk POST.
export type CloudinaryChunkUploadResult = {
  done: boolean;
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  format?: string;
  etag?: string;
};

export type CloudinarySession = {
  file: File;
  fileKey: string;
  uploadSessionId: string;
  publicId: string;
  chunkSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  controller: AbortController | null;
  sign: CloudinarySignResponse | null;
};

export type ChunkedUploadParams = {
  file: File;
  chunkSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  sign: CloudinarySignResponse;
  uploadSessionId: string;
  controller: AbortController;
  concurrency?: number;
  onChunkComplete: (index: number) => void;
  onRetryLog?: (chunk: FileChunk, attempt: number, delayMs: number) => void;
};

export type ChunkedUploadResult =
  | { status: "completed" }
  | { status: "paused" }
  | { status: "expired" }
  | { status: "error"; error: Error };

export type ChunkUploadContext = {
  file: File;
  sign: CloudinarySignResponse;
  uploadSessionId: string;
  controller: AbortController;
  completedChunks: Set<number>;
  onChunkComplete: (index: number) => void;
  onRetryLog?: (chunk: FileChunk, attempt: number, delayMs: number) => void;
};

export type CloudinaryUploadRecord = {
  fileKey: string;
  uploadSessionId: string;
  publicId: string;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number[];
};

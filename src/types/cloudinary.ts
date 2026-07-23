import { FileChunk } from "./file";

export type CloudinarySignedData = {
  duplicate: false;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
};

export type CloudinaryDuplicateResult = {
  duplicate: true;
  publicId: string;
  url: string;
};

export type CloudinarySignResult =
  | CloudinarySignedData
  | CloudinaryDuplicateResult;

export type CloudinarySignApiResponse =
  | { success: true; data: CloudinarySignResult }
  | { success: false; message: string; error: string };

export type CloudinarySaveRequest = {
  publicId: string;
  fileHash: string;
  url: string;
};

export type CloudinarySaveApiResponse =
  | { success: true; data: unknown }
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
  fileHash: string | null;
  uploadSessionId: string;
  publicId: string;
  chunkSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  controller: AbortController | null;
  sign: CloudinarySignedData | null;
  resultUrl?: string;
};

export type ChunkedUploadParams = {
  file: File;
  chunkSize: number;
  totalChunks: number;
  completedChunks: Set<number>;
  sign: CloudinarySignedData;
  uploadSessionId: string;
  controller: AbortController;
  concurrency?: number;
  onChunkComplete: (index: number, result: CloudinaryChunkUploadResult) => void;
  onRetryLog?: (chunk: FileChunk, attempt: number, delayMs: number) => void;
};

export type ChunkedUploadResult =
  | { status: "completed" }
  | { status: "paused" }
  | { status: "expired" }
  | { status: "error"; error: Error };

export type ChunkUploadContext = {
  file: File;
  sign: CloudinarySignedData;
  uploadSessionId: string;
  controller: AbortController;
  completedChunks: Set<number>;
  onChunkComplete: (index: number, result: CloudinaryChunkUploadResult) => void;
  onRetryLog?: (chunk: FileChunk, attempt: number, delayMs: number) => void;
};

export type CloudinaryUploadRecord = {
  fileKey: string;
  fileHash: string;
  uploadSessionId: string;
  publicId: string;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number[];
  resultUrl?: string;
};

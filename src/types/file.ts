export type FileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "text"
  | "unknown";

export type FileChunk = {
  index: number;
  start: number;
  end: number;
  size: number;
  chunk: Blob;
};

export enum UploadStatus {
  NEW = "NEW",
  UPLOADING = "UPLOADING",
  COMPLETED = "COMPLETED",
  MERGING = "MERGING",
  FAILED = "FAILED",
}

export type InitUploadResponse = {
  success: boolean;
  data: {
    status: "NEW" | "UPLOADING" | "COMPLETED" | "MERGING" | "FAILED";
    uploadId: string;
    uploadedChunks?: number[];
    deduplicated?: boolean;
  };
};

export type ChunkUploadResponse = {
  success: boolean;
  data: {
    status: string;
    uploadId: string;
    chunkIndex: number;
    uploadedChunks: number;
    totalChunks: number;
    isComplete: boolean;
  };
};

export enum FileUploadingStatusEnum {
  IDLE,
  QUEUED,
  UPLOADING,
  PAUSED,
  MERGING,
  COMPLETED,
  ERROR,
}

export type UploadFileItem = {
  id: string;
  file: File;
  status: FileUploadingStatusEnum;
  progress: number;
  errorMessage: string | null;
  logs: string[];
  resumableUploadId?: string;
};

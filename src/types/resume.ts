export type ResumableUploadRecord = {
  fileHash: string;
  fileName: string;
  fileSize: number;
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number;
  strategy: string;
  updatedAt: number;
};

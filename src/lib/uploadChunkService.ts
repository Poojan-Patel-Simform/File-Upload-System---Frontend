import { ChunkUploadResponse, FileChunk } from "@/types/file";
import { sha256Hex } from "@/lib/hashService";
import { withRetry } from "@/lib/retryService";
import api from "@/lib/axios";
import { DEFAULT_RETRIES } from "@/constants";

export const uploadChunk = async (
  chunk: FileChunk,
  uploadId: string,
  signal: AbortSignal,
  onRetry: (attempt: number, delayMs: number) => void,
): Promise<void> => {
  const checksum = await sha256Hex(chunk.chunk);

  await withRetry(
    async () => {
      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunk.index));
      formData.append("checksum", checksum);
      formData.append("file", chunk.chunk);

      const response = await api.post("/uploads/chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal,
      });

      const chunkData: ChunkUploadResponse = response.data;
      if (!chunkData.success) {
        throw new Error(`Failed to upload chunk ${chunk.index}`);
      }
    },
    { retries: DEFAULT_RETRIES, onRetry },
  );
};

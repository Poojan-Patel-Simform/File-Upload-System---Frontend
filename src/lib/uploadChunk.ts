import { ChunkUploadResponse, FileChunk } from "@/types/file";
import { sha256Hex } from "@/lib/hash";
import { withRetry } from "@/lib/retry";
import api from "@/lib/axios";

export const CHUNK_RETRIES = 3;

/**
 * Uploads a single chunk (with a checksum for integrity) and retries on
 * failure. Identical for every upload strategy — only the order/concurrency
 * in which chunks get handed to this function differs between strategies.
 */
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
    { retries: CHUNK_RETRIES, onRetry },
  );
};

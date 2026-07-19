import axios from "axios";
import { FileChunk } from "@/types/file";
import { CloudinarySigningMeta, CloudinaryChunkUploadResult } from "@/types/cloudinary";
import { withRetry } from "@/lib/retry";
import { CHUNK_RETRIES } from "@/constants/upload";

// POSTs one chunk straight to Cloudinary. Deliberately uses a plain axios
// call rather than the `api` instance from `@/lib/axios.ts` — that instance
// carries OUR backend's baseURL/interceptors, which must never be sent to a
// third-party host.
export const uploadChunkToCloudinary = async (
  chunk: FileChunk,
  totalFileSize: number,
  meta: CloudinarySigningMeta,
  signal: AbortSignal,
  onRetry: (attempt: number, delayMs: number) => void,
): Promise<CloudinaryChunkUploadResult> =>
  withRetry(
    async () => {
      const formData = new FormData();
      formData.append("file", chunk.chunk);
      formData.append("api_key", meta.apiKey);
      formData.append("timestamp", String(meta.timestamp));
      formData.append("signature", meta.signature);
      formData.append("public_id", meta.publicId);

      // chunk.end is exclusive in this codebase's FileChunk type, so the
      // Content-Range end byte is chunk.end - 1.
      const response = await axios.post<CloudinaryChunkUploadResult>(
        meta.uploadUrl,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            "X-Unique-Upload-Id": meta.uniqueUploadId,
            "Content-Range": `bytes ${chunk.start}-${chunk.end - 1}/${totalFileSize}`,
          },
          signal,
        },
      );

      return response.data;
    },
    { retries: CHUNK_RETRIES, onRetry },
  );

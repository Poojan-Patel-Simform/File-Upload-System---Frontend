import { FileChunk } from "@/types/file";
import { getChunkSize } from "@/lib/fileProcess";
import { CLOUDINARY_MIN_CHUNK_SIZE } from "@/constants/cloudinary";

// Same chunking loop as generateFileChunks, but clamped to Cloudinary's
// >5MB-per-non-final-chunk rule. Only the last emitted chunk can ever be
// smaller than the clamp (the loop always emits full-size chunks until the
// final remainder), and Cloudinary's rule already exempts the last chunk —
// so no extra branching is needed for a too-small second-to-last chunk.
export const generateCloudinaryFileChunks = (file: File): FileChunk[] => {
  const chunks: FileChunk[] = [];

  let index = 0;

  const chunkSize = Math.max(getChunkSize(file.size), CLOUDINARY_MIN_CHUNK_SIZE);

  for (let start = 0; start < file.size; start = start + chunkSize) {
    const end = Math.min(start + chunkSize, file.size);

    chunks.push({
      index,
      start,
      end,
      size: end - start,
      chunk: file.slice(start, end),
    });

    index++;
  }
  return chunks;
};

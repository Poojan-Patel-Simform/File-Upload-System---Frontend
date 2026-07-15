import { FileChunk } from "@/types/file";

export const getChunkSize = (fileSize: number): number => {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  if (fileSize <= 10 * MB) {
    return 1 * MB;
  }

  if (fileSize <= 100 * MB) {
    return 5 * MB;
  }

  if (fileSize <= 1 * GB) {
    return 10 * MB;
  }

  if (fileSize <= 10 * GB) {
    return 25 * MB;
  }

  return 50 * MB;
};

export const generateFileChunks = (file: File): FileChunk[] => {
  const chunks: FileChunk[] = [];

  let index = 0;

  const chunkSize = getChunkSize(file.size);

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

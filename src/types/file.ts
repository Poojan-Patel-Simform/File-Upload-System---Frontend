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

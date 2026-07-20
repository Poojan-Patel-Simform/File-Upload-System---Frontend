export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error("Bytes must be a non-negative number");
  }

  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = bytes / Math.pow(k, i);

  return `${parseFloat(value.toFixed(decimals))} ${units[i]}`;
};

import { FileType } from "@/types/file";

export const getFileType = (file: File | string): FileType => {
  const mimeType = typeof file === "string" ? "" : file.type.toLowerCase();

  const fileName =
    typeof file === "string" ? file.toLowerCase() : file.name.toLowerCase();

  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  if (mimeType === "application/pdf") return "pdf";

  const ext = fileName.split(".").pop() ?? "";

  const extensionMap: Record<string, FileType> = {
    jpg: "image",
    jpeg: "image",
    png: "image",
    gif: "image",
    webp: "image",
    svg: "image",
    bmp: "image",
    ico: "image",

    mp4: "video",
    mov: "video",
    avi: "video",
    mkv: "video",
    webm: "video",

    mp3: "audio",
    wav: "audio",
    aac: "audio",
    flac: "audio",
    ogg: "audio",

    pdf: "pdf",
    doc: "document",
    docx: "document",

    xls: "spreadsheet",
    xlsx: "spreadsheet",
    csv: "spreadsheet",

    ppt: "presentation",
    pptx: "presentation",

    zip: "archive",
    rar: "archive",
    "7z": "archive",
    tar: "archive",
    gz: "archive",

    txt: "text",
    md: "text",
    json: "text",
    xml: "text",
    js: "text",
    ts: "text",
    html: "text",
    css: "text",
  };

  return extensionMap[ext] ?? "unknown";
};

import { FileType } from "@/types/file";

export const getFileType = (file: File | string): FileType => {
  const mimeType = typeof file === "string" ? "" : file.type.toLowerCase();

  const fileName =
    typeof file === "string" ? file.toLowerCase() : file.name.toLowerCase();

  // MIME type detection
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  if (mimeType === "application/pdf") return "pdf";

  // Extension detection
  const ext = fileName.split(".").pop() ?? "";

  const extensionMap: Record<string, FileType> = {
    // Images
    jpg: "image",
    jpeg: "image",
    png: "image",
    gif: "image",
    webp: "image",
    svg: "image",
    bmp: "image",
    ico: "image",

    // Videos
    mp4: "video",
    mov: "video",
    avi: "video",
    mkv: "video",
    webm: "video",

    // Audio
    mp3: "audio",
    wav: "audio",
    aac: "audio",
    flac: "audio",
    ogg: "audio",

    // Documents
    pdf: "pdf",
    doc: "document",
    docx: "document",

    // Spreadsheets
    xls: "spreadsheet",
    xlsx: "spreadsheet",
    csv: "spreadsheet",

    // Presentations
    ppt: "presentation",
    pptx: "presentation",

    // Archives
    zip: "archive",
    rar: "archive",
    "7z": "archive",
    tar: "archive",
    gz: "archive",

    // Text
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

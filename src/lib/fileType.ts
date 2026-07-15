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

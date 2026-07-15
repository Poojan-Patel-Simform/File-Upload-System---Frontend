"use client";

import { useEffect, useMemo } from "react";
import { formatBytes } from "@/lib/fileSize";
import { getFileType } from "@/lib/fileType";
import { FileType } from "@/types/file";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";

type PropsType = {
  file: File | null;
};

const FILE_TYPE_ICON: Record<FileType, typeof File> = {
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: FileText,
  archive: FileArchive,
  text: FileCode,
  unknown: File,
};

const FileDetails = ({ file }: PropsType) => {
  const fileType = file ? getFileType(file.name) : "unknown";
  const canPreview = fileType === "image" || fileType === "video";

  const previewUrl = useMemo(() => {
    if (!file || !canPreview) return null;
    return URL.createObjectURL(file);
  }, [file, canPreview]);

  // Revokes the previous object URL whenever previewUrl changes (new file, or
  // canPreview toggling) and on unmount, so blob URLs don't leak memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!file) return null;

  const Icon = FILE_TYPE_ICON[fileType];

  return (
    <div className="flex w-full items-center gap-4">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-primary/20 to-accent/20 text-primary">
        {/* Image/video get a live preview; every other type falls back to a
            type-keyed icon from FILE_TYPE_ICON. */}
        {previewUrl && fileType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="size-full object-cover"
          />
        )}
        {previewUrl && fileType === "video" && (
          <video src={previewUrl} className="size-full object-cover" muted />
        )}
        {!previewUrl && <Icon className="size-6" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-medium">{file.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            {formatBytes(file.size)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 capitalize">
            {fileType}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FileDetails;

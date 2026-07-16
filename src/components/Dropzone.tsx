"use client";

import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/fileSize";
import { AlertTriangle, UploadCloud } from "lucide-react";
import { DropzoneProps } from "@/types/dropzone";
import { DEFAULT_MAX_SIZE, DEFAULT_MAX_FILES } from "@/constants/dropzone";

const Dropzone = ({
  onAddFiles,
  accept,
  maxSize = DEFAULT_MAX_SIZE,
  maxFiles = DEFAULT_MAX_FILES,
}: DropzoneProps) => {
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) onAddFiles(acceptedFiles);
  };

  // isDragActive/fileRejections are local drag-interaction state, not upload
  // state — this component stays presentational despite calling a hook.
  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      multiple: true,
      accept,
      maxSize,
      maxFiles,
    });

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "group relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-white/3 p-8 text-center transition-all duration-300 hover:border-primary/50 hover:bg-white/5",
          isDragActive &&
            "scale-[1.01] border-primary bg-primary/10 shadow-lg shadow-primary/20",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl transition-opacity duration-300",
            isDragActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
          )}
        />

        <input {...getInputProps()} />

        <div className="relative flex flex-col items-center gap-3">
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 to-accent/20 text-primary transition-transform duration-300",
              isDragActive ? "scale-110" : "group-hover:scale-105",
            )}
          >
            <UploadCloud className="size-7" />
          </div>

          <p className="text-lg font-medium">
            {isDragActive
              ? "Drop it right here"
              : "Drag & drop files to upload"}
          </p>
          <p className="text-sm text-muted-foreground">
            or <span className="font-medium text-primary">click to browse</span>{" "}
            from your device
          </p>
        </div>
      </div>

      {/* Singular/plural summary line, then one entry per rejected file. */}
      {fileRejections.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {fileRejections.length === 1
              ? "1 file was rejected"
              : `${fileRejections.length} files were rejected`}
          </p>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {fileRejections.map(({ file, errors }) => (
              <li key={`${file.name}-${file.size}`} className="truncate">
                <span className="font-medium text-foreground">{file.name}</span>{" "}
                ({formatBytes(file.size)}) —{" "}
                {errors.map((e) => e.message).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Dropzone;

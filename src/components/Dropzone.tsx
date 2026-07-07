"use client";

import React, { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import FileDetails from "./FileDetails";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";

type PropsType = {
  onSetFile: (file: File | null) => void;
  file: File | null;
};

const Dropzone = ({ onSetFile, file }: PropsType) => {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onSetFile(acceptedFiles[0]);
    },
    [onSetFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "group relative flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-white/3 p-8 text-center transition-all duration-300 hover:border-primary/50 hover:bg-white/5",
        isDragActive &&
          "scale-[1.01] border-primary bg-primary/10 shadow-lg shadow-primary/20",
        file && "min-h-fit items-start text-left",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl transition-opacity duration-300",
          isDragActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
        )}
      />

      <input {...getInputProps()} />

      {!file && (
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
              : "Drag & drop a file to upload"}
          </p>
          <p className="text-sm text-muted-foreground">
            or{" "}
            <span className="font-medium text-primary">click to browse</span>{" "}
            from your device
          </p>
        </div>
      )}

      {file && <FileDetails file={file} />}
    </div>
  );
};

export default Dropzone;

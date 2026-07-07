"use client";

import { useRef, useState } from "react";
import api from "@/lib/axios";
import { FileUploadingStatusEnum } from "@/types/file";

const useFileUploadTraditional = () => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<FileUploadingStatusEnum>(
    FileUploadingStatusEnum.IDlE,
  );
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setStatus(FileUploadingStatusEnum.UPLOADING);
    setErrorMessage(null);
    setProgress(0);
    setLogs([
      `[upload] starting traditional upload — ${file.name} (${file.size} bytes)`,
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("fileName", file.name);
      formData.append("fileSize", String(file.size));

      const response = await api.post("/uploads/single", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: abortController.signal,
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          setProgress(percent);
        },
      });

      if (!response.data?.success) {
        throw new Error("Upload failed");
      }

      setLogs((prev) => [...prev, "[upload] complete"]);
      setStatus(FileUploadingStatusEnum.COMPLETED);
      setProgress(100);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setLogs((prev) => [...prev, "[upload] cancelled"]);
        return;
      }
      setLogs((prev) => [...prev, "[upload] failed"]);
      setStatus(FileUploadingStatusEnum.ERROR);
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  // No pause/resume possible — it's a single in-flight request.
  // Cancel is the only mid-flight control available.
  const handleCancel = () => {
    abortControllerRef.current?.abort();
    setFile(null);
    setStatus(FileUploadingStatusEnum.IDlE);
    setProgress(0);
    setErrorMessage(null);
    setLogs((prev) => [...prev, "[upload] cancelled, state reset"]);
  };

  return {
    file,
    setFile,
    status,
    handleUpload,
    handleCancel,
    progress,
    errorMessage,
    logs,
  };
};

export default useFileUploadTraditional;

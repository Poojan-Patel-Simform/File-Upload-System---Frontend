"use client";

import { useRef, useState } from "react";
import api from "@/lib/axios";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";

const useFileUploadTraditional = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  const fileMapRef = useRef<Record<string, File>>({});

  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const updateFile = (id: string, patch: Partial<UploadFileItem>) => {
    setFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const appendLog = (id: string, line: string) => {
    setFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, logs: [...item.logs, line] } : item,
      ),
    );
  };

  const handleUpload = async (id: string) => {
    const file = fileMapRef.current[id];
    if (!file) return;

    updateFile(id, {
      status: FileUploadingStatusEnum.UPLOADING,
      errorMessage: null,
      progress: 0,
      logs: [
        `[upload] starting traditional upload — ${file.name} (${file.size} bytes)`,
      ],
    });

    const abortController = new AbortController();
    abortControllersRef.current[id] = abortController;

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
          updateFile(id, { progress: percent });
        },
      });

      if (!response.data?.success) {
        throw new Error("Upload failed");
      }

      appendLog(id, "[upload] complete");
      updateFile(id, {
        status: FileUploadingStatusEnum.COMPLETED,
        progress: 100,
      });
    } catch (err) {
      const wasCancelled =
        err instanceof DOMException && err.name === "AbortError";
      if (wasCancelled) {
        appendLog(id, "[upload] cancelled");
        return;
      }

      appendLog(id, "[upload] failed");
      updateFile(id, {
        status: FileUploadingStatusEnum.ERROR,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      delete abortControllersRef.current[id];
    }
  };

  const addFiles = (newFiles: File[]) => {
    const newItems: UploadFileItem[] = [];

    for (const file of newFiles) {
      const id = crypto.randomUUID();
      fileMapRef.current[id] = file;

      newItems.push({
        id,
        file,
        status: FileUploadingStatusEnum.IDLE,
        progress: 0,
        errorMessage: null,
        logs: [],
      });
    }

    setFiles((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      void handleUpload(item.id);
    }
  };

  const handleCancel = (id: string) => {
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];

    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      progress: 0,
      errorMessage: null,
    });
    appendLog(id, "[upload] cancelled, state reset");
  };

  const removeFile = (id: string) => {
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];
    delete fileMapRef.current[id];
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    files,
    addFiles,
    handleUpload,
    handleCancel,
    removeFile,
  };
};

export default useFileUploadTraditional;

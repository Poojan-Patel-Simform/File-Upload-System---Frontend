"use client";

import { useCallback, useRef, useState } from "react";
import api from "@/lib/axios";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";

const useFileUploadTraditional = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  const fileMapRef = useRef<Record<string, File>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const updateFile = useCallback(
    (
      id: string,
      patch:
        | Partial<UploadFileItem>
        | ((item: UploadFileItem) => Partial<UploadFileItem>),
    ) => {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, ...(typeof patch === "function" ? patch(item) : patch) }
            : item,
        ),
      );
    },
    [],
  );

  const appendLog = useCallback(
    (id: string, line: string) =>
      updateFile(id, (item) => ({ logs: [...item.logs, line] })),
    [updateFile],
  );

  const handleUpload = useCallback(
    async (id: string) => {
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
        if (err instanceof DOMException && err.name === "AbortError") {
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
    },
    [updateFile, appendLog],
  );

  // New files auto-start uploading immediately — no manual trigger needed.
  const addFiles = useCallback(
    (newFiles: File[]) => {
      const items: UploadFileItem[] = newFiles.map((file) => {
        const id = crypto.randomUUID();
        fileMapRef.current[id] = file;
        return {
          id,
          file,
          status: FileUploadingStatusEnum.IDlE,
          progress: 0,
          errorMessage: null,
          logs: [],
        };
      });

      setFiles((prev) => [...prev, ...items]);
      items.forEach((item) => void handleUpload(item.id));
    },
    [handleUpload],
  );

  const handleCancel = useCallback(
    (id: string) => {
      abortControllersRef.current[id]?.abort();
      delete abortControllersRef.current[id];
      updateFile(id, {
        status: FileUploadingStatusEnum.IDlE,
        progress: 0,
        errorMessage: null,
      });
      appendLog(id, "[upload] cancelled, state reset");
    },
    [updateFile, appendLog],
  );

  const removeFile = useCallback((id: string) => {
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];
    delete fileMapRef.current[id];
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return {
    files,
    addFiles,
    handleUpload,
    handleCancel,
    removeFile,
  };
};

export default useFileUploadTraditional;

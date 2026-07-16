"use client";

import { useRef, useState } from "react";
import api from "@/lib/axios";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";

/**
 * Traditional (single-shot) file upload hook.
 *
 * Posts the whole file as one FormData request and tracks progress via axios
 * upload-progress events. No chunking, hashing, or resumable-upload support —
 * the simplest of the three upload strategies.
 *
 * @returns files - current upload items with status/progress/logs
 * @returns addFiles - add new File objects and start uploading them immediately
 * @returns handleUpload - start uploading a file
 * @returns handleCancel - abort and hard-reset a file back to IDLE
 * @returns removeFile - cancel and drop a file from the list entirely
 */
const useFileUploadTraditional = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  // Raw File objects keyed by id — kept in a ref instead of state since File
  // instances aren't meant to trigger re-renders and only need to be read back
  // by id when an upload starts.
  const fileMapRef = useRef<Record<string, File>>({});

  // Per-id AbortController so handleCancel/removeFile can abort an in-flight
  // request without waiting for a re-render.
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

  // Status state machine (FileUploadingStatusEnum):
  //   IDLE -> UPLOADING (this function, called directly from addFiles)
  //   UPLOADING -> COMPLETED | ERROR (this function, on request settle)
  //   any -> IDLE (handleCancel, forced hard reset)
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

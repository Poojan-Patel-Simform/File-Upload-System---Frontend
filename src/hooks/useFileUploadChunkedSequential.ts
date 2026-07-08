"use client";

import {
  ChunkUploadResponse,
  FileUploadingStatusEnum,
  InitUploadResponse,
  UploadFileItem,
  UploadStatus,
} from "@/types/file";
import { useCallback, useRef, useState } from "react";
import useHash from "./useHash";
import { generateFileChunks } from "@/lib/fileProcess";
import api from "@/lib/axios";

type Chunks = ReturnType<typeof generateFileChunks>;

const useFileUploadChunkedSequential = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  const { handleGetHash } = useHash();

  const fileMapRef = useRef<Record<string, File>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const pausedFlagsRef = useRef<Record<string, boolean>>({});
  const uploadStatesRef = useRef<
    Record<string, { uploadId: string; chunks: Chunks }>
  >({});
  const chunkCountsRef = useRef<Record<string, { uploaded: number; total: number }>>(
    {},
  );

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

  const setChunkProgress = useCallback(
    (id: string, uploaded: number) => {
      const counts = chunkCountsRef.current[id];
      if (!counts) return;
      counts.uploaded = uploaded;
      const percent =
        counts.total > 0 ? Math.round((uploaded / counts.total) * 100) : 0;
      updateFile(id, { progress: percent });
    },
    [updateFile],
  );

  const runUploadLoop = useCallback(
    async (
      id: string,
      uploadId: string,
      chunks: Chunks,
      startCount: number,
      chunkLength: number,
    ) => {
      const abortController = new AbortController();
      abortControllersRef.current[id] = abortController;

      let completedCount = startCount;

      for (const chunk of chunks) {
        if (pausedFlagsRef.current[id]) {
          uploadStatesRef.current[id] = {
            uploadId,
            chunks: chunks.slice(chunks.indexOf(chunk)),
          };

          appendLog(
            id,
            `[upload] paused at chunk ${chunk.index} (${completedCount}/${chunkLength} done)`,
          );
          updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
          return;
        }

        const formData = new FormData();
        formData.append("uploadId", uploadId);
        formData.append("chunkIndex", String(chunk.index));
        formData.append("file", chunk.chunk);

        try {
          const response = await api.post("/uploads/chunk", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            signal: abortController.signal,
          });

          const chunkData: ChunkUploadResponse = response.data;
          if (!chunkData.success) {
            throw new Error(`Failed to upload chunk ${chunk.index}`);
          }

          completedCount++;
          setChunkProgress(id, completedCount);
          appendLog(
            id,
            `[upload] chunk ${chunk.index} uploaded (${completedCount}/${chunkLength})`,
          );
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            appendLog(id, `[upload] cancelled at chunk ${chunk.index}`);
            return;
          }
          appendLog(id, `[upload] chunk ${chunk.index} failed`);
          updateFile(id, {
            status: FileUploadingStatusEnum.ERROR,
            errorMessage:
              err instanceof Error ? err.message : "Unknown upload error",
          });
          return;
        }
      }

      appendLog(id, `[upload] complete — ${completedCount}/${chunkLength} chunks`);
      updateFile(id, { status: FileUploadingStatusEnum.COMPLETED, progress: 100 });
      delete uploadStatesRef.current[id];
    },
    [appendLog, updateFile, setChunkProgress],
  );

  const handleUpload = useCallback(
    async (id: string) => {
      const file = fileMapRef.current[id];
      if (!file) return;

      updateFile(id, {
        status: FileUploadingStatusEnum.UPLOADING,
        errorMessage: null,
      });
      pausedFlagsRef.current[id] = false;

      try {
        const chunks = generateFileChunks(file);
        const fileHash = await handleGetHash(file);

        const response = await api.post("/uploads/init", {
          fileHash,
          fileName: file.name,
          fileSize: file.size,
          totalChunks: chunks.length,
        });

        const initData: InitUploadResponse = response.data;
        if (!initData.success) throw new Error("Failed to initialize upload");

        const {
          uploadId,
          status: initStatus,
          uploadedChunks = [],
        } = initData.data;
        chunkCountsRef.current[id] = { uploaded: 0, total: chunks.length };

        if (initStatus === UploadStatus.COMPLETED) {
          appendLog(id, "[upload] file already uploaded, deduplicated");
          setChunkProgress(id, chunks.length);
          updateFile(id, {
            status: FileUploadingStatusEnum.COMPLETED,
            progress: 100,
          });
          return;
        }

        const alreadyUploaded = new Set(uploadedChunks);
        const remaining = chunks.filter((c) => !alreadyUploaded.has(c.index));

        setChunkProgress(id, alreadyUploaded.size);
        appendLog(
          id,
          `[upload] starting — ${alreadyUploaded.size}/${chunks.length} chunks already on server`,
        );

        uploadStatesRef.current[id] = { uploadId, chunks: remaining };
        await runUploadLoop(
          id,
          uploadId,
          remaining,
          alreadyUploaded.size,
          chunks.length,
        );
      } catch (err) {
        appendLog(id, "[upload] init failed");
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [handleGetHash, appendLog, updateFile, setChunkProgress, runUploadLoop],
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

  const handlePause = useCallback(
    (id: string) => {
      pausedFlagsRef.current[id] = true;
      appendLog(id, "[upload] pause requested");
    },
    [appendLog],
  );

  // Resumes directly from uploadStatesRef — no re-hash, no re-init call.
  const handleResume = useCallback(
    async (id: string) => {
      const uploadState = uploadStatesRef.current[id];
      if (!uploadState) return;

      pausedFlagsRef.current[id] = false;
      updateFile(id, { status: FileUploadingStatusEnum.UPLOADING });
      appendLog(id, "[upload] resuming");

      const counts = chunkCountsRef.current[id];
      const { uploadId, chunks } = uploadState;
      await runUploadLoop(
        id,
        uploadId,
        chunks,
        counts?.uploaded ?? 0,
        counts?.total ?? 0,
      );
    },
    [updateFile, appendLog, runUploadLoop],
  );

  const handleCancel = useCallback(
    (id: string) => {
      abortControllersRef.current[id]?.abort();
      delete abortControllersRef.current[id];
      pausedFlagsRef.current[id] = false;
      delete uploadStatesRef.current[id];
      delete chunkCountsRef.current[id];
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
    delete pausedFlagsRef.current[id];
    delete uploadStatesRef.current[id];
    delete chunkCountsRef.current[id];
    delete fileMapRef.current[id];
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return {
    files,
    addFiles,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
    removeFile,
  };
};

export default useFileUploadChunkedSequential;

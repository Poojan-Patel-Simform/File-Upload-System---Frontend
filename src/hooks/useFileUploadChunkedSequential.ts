"use client";

import {
  ChunkUploadResponse,
  FileUploadingStatusEnum,
  InitUploadResponse,
  UploadFileItem,
} from "@/types/file";
import { useCallback, useRef, useState } from "react";
import useHash from "./useHash";
import { sha256Hex } from "@/lib/hash";
import { withRetry } from "@/lib/retry";
import { generateFileChunks } from "@/lib/fileProcess";
import { mapServerStatusToClientStatus } from "@/lib/statusMapping";
import { useUploadQueue } from "@/contexts/UploadQueueContext";
import {
  clearResumableUpload,
  getResumableUpload,
  putResumableUpload,
} from "@/lib/resumeStore";
import api from "@/lib/axios";

const CHUNK_RETRIES = 3;

type Chunks = ReturnType<typeof generateFileChunks>;
type Chunk = Chunks[number];

const useFileUploadChunkedSequential = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const { handleGetHash } = useHash();
  const queue = useUploadQueue();

  const fileMapRef = useRef<Record<string, File>>({});

  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const pausedFlagsRef = useRef<Record<string, boolean>>({});

  const uploadStatesRef = useRef<
    Record<string, { uploadId: string; chunks: Chunks }>
  >({});

  const chunkCountsRef = useRef<
    Record<string, { uploaded: number; total: number }>
  >({});

  const fileHashCacheRef = useRef<Record<string, string>>({});

  const resumeContextRef = useRef<
    Record<
      string,
      { fileHash: string; fileName: string; fileSize: number; uploadId: string }
    >
  >({});

  const updateFile = useCallback(
    (id: string, patch: Partial<UploadFileItem>) => {
      setFiles((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const appendLog = useCallback((id: string, line: string) => {
    setFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, logs: [...item.logs, line] } : item,
      ),
    );
  }, []);

  const setChunkProgress = useCallback(
    (id: string, uploaded: number) => {
      const counts = chunkCountsRef.current[id];
      if (!counts) return;

      counts.uploaded = uploaded;
      const percent =
        counts.total > 0 ? Math.round((uploaded / counts.total) * 100) : 0;
      updateFile(id, { progress: percent });

      const ctx = resumeContextRef.current[id];
      if (ctx) {
        putResumableUpload({
          fileHash: ctx.fileHash,
          fileName: ctx.fileName,
          fileSize: ctx.fileSize,
          uploadId: ctx.uploadId,
          totalChunks: counts.total,
          uploadedChunks: uploaded,
          strategy: "sequential",
          updatedAt: Date.now(),
        });
      }
    },
    [updateFile],
  );

  const sendChunk = useCallback(
    async (
      chunk: Chunk,
      uploadId: string,
      signal: AbortSignal,
      onRetry: (attempt: number, delayMs: number) => void,
    ) => {
      const checksum = await sha256Hex(chunk.chunk);

      await withRetry(
        async () => {
          const formData = new FormData();
          formData.append("uploadId", uploadId);
          formData.append("chunkIndex", String(chunk.index));
          formData.append("checksum", checksum);
          formData.append("file", chunk.chunk);

          const response = await api.post("/uploads/chunk", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            signal,
          });

          const chunkData: ChunkUploadResponse = response.data;
          if (!chunkData.success) {
            throw new Error(`Failed to upload chunk ${chunk.index}`);
          }
        },
        { retries: CHUNK_RETRIES, onRetry },
      );
    },
    [],
  );

  const sendChunksSequentially = useCallback(
    async (
      id: string,
      uploadId: string,
      chunks: Chunks,
      startCount: number,
      totalChunks: number,
    ) => {
      const abortController = new AbortController();
      abortControllersRef.current[id] = abortController;
      chunkCountsRef.current[id] = { uploaded: startCount, total: totalChunks };

      let completedCount = startCount;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        if (pausedFlagsRef.current[id]) {
          uploadStatesRef.current[id] = { uploadId, chunks: chunks.slice(i) };
          appendLog(
            id,
            `[upload] paused at chunk ${chunk.index} (${completedCount}/${totalChunks} done)`,
          );
          updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
          return;
        }

        const isFinalChunk = completedCount + 1 === totalChunks;
        if (isFinalChunk) {
          updateFile(id, { status: FileUploadingStatusEnum.MERGING });
          appendLog(
            id,
            "[upload] all chunks sent — server is finalizing (merge + verify)...",
          );
        }

        try {
          await sendChunk(
            chunk,
            uploadId,
            abortController.signal,
            (attempt, delayMs) =>
              appendLog(
                id,
                `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${CHUNK_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
              ),
          );

          completedCount++;
          setChunkProgress(id, completedCount);
          appendLog(
            id,
            `[upload] chunk ${chunk.index} uploaded (${completedCount}/${totalChunks})`,
          );
        } catch (err) {
          const wasCancelled =
            err instanceof DOMException && err.name === "AbortError";
          if (wasCancelled) {
            appendLog(id, `[upload] cancelled at chunk ${chunk.index}`);
            return;
          }

          appendLog(
            id,
            `[upload] chunk ${chunk.index} failed permanently after ${CHUNK_RETRIES} retries`,
          );
          updateFile(id, {
            status: FileUploadingStatusEnum.ERROR,
            errorMessage:
              err instanceof Error ? err.message : "Unknown upload error",
          });
          return;
        }
      }

      appendLog(
        id,
        `[upload] complete — ${completedCount}/${totalChunks} chunks`,
      );
      updateFile(id, {
        status: FileUploadingStatusEnum.COMPLETED,
        progress: 100,
      });
      delete uploadStatesRef.current[id];

      const ctx = resumeContextRef.current[id];
      if (ctx) clearResumableUpload(ctx.fileHash);
      delete resumeContextRef.current[id];
    },
    [sendChunk, appendLog, updateFile, setChunkProgress],
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

        let fileHash = fileHashCacheRef.current[id];
        if (!fileHash) {
          appendLog(
            id,
            "[hash] computing file hash (SHA-256) for dedup/integrity check...",
          );
          fileHash = await handleGetHash(file);
          appendLog(id, "[hash] done");
          fileHashCacheRef.current[id] = fileHash;
        }

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

        if (
          mapServerStatusToClientStatus(initStatus) ===
          FileUploadingStatusEnum.COMPLETED
        ) {
          appendLog(id, "[upload] file already uploaded, deduplicated");
          setChunkProgress(id, chunks.length);
          updateFile(id, {
            status: FileUploadingStatusEnum.COMPLETED,
            progress: 100,
          });
          clearResumableUpload(fileHash);
          return;
        }

        resumeContextRef.current[id] = {
          fileHash,
          fileName: file.name,
          fileSize: file.size,
          uploadId,
        };

        const alreadyUploaded = new Set(uploadedChunks);
        const remaining = chunks.filter((c) => !alreadyUploaded.has(c.index));

        setChunkProgress(id, alreadyUploaded.size);
        appendLog(
          id,
          `[upload] starting — ${alreadyUploaded.size}/${chunks.length} chunks already on server`,
        );

        uploadStatesRef.current[id] = { uploadId, chunks: remaining };
        await sendChunksSequentially(
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
    [
      handleGetHash,
      appendLog,
      updateFile,
      setChunkProgress,
      sendChunksSequentially,
    ],
  );

  const enqueueUpload = useCallback(
    (id: string) => {
      updateFile(id, {
        status: FileUploadingStatusEnum.QUEUED,
        resumableUploadId: undefined,
      });
      appendLog(id, "[queue] waiting for a free upload slot");
      queue.enqueue(id, () => handleUpload(id));
    },
    [handleUpload, queue, appendLog, updateFile],
  );

  const addFiles = useCallback(
    (newFiles: File[]) => {
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
        void (async () => {
          const fileHash = await handleGetHash(item.file);
          fileHashCacheRef.current[item.id] = fileHash;

          const record = getResumableUpload(fileHash);
          if (record && record.uploadedChunks < record.totalChunks) {
            updateFile(item.id, { resumableUploadId: record.uploadId });
            appendLog(
              item.id,
              `[resume] resumable upload detected — ${record.uploadedChunks}/${record.totalChunks} chunks already uploaded previously`,
            );
            return;
          }

          enqueueUpload(item.id);
        })();
      }
    },
    [handleGetHash, appendLog, updateFile, enqueueUpload],
  );

  const handleResumeDetected = useCallback(
    (id: string) => {
      appendLog(id, "[resume] resuming previous upload");
      enqueueUpload(id);
    },
    [enqueueUpload, appendLog],
  );

  const handleStartFresh = useCallback(
    async (id: string) => {
      const fileHash = fileHashCacheRef.current[id];
      const record = fileHash ? getResumableUpload(fileHash) : null;

      if (record) {
        try {
          await api.delete(`/uploads/${record.uploadId}`);
          appendLog(id, "[resume] aborted previous upload on the server");
        } catch {
          appendLog(
            id,
            "[resume] could not abort previous upload on the server, continuing anyway",
          );
        }
        clearResumableUpload(record.fileHash);
      }

      enqueueUpload(id);
    },
    [enqueueUpload, appendLog],
  );

  const handlePause = useCallback(
    (id: string) => {
      pausedFlagsRef.current[id] = true;
      appendLog(id, "[upload] pause requested");
    },
    [appendLog],
  );

  const handleResume = useCallback(
    async (id: string) => {
      const uploadState = uploadStatesRef.current[id];
      if (!uploadState) return;

      pausedFlagsRef.current[id] = false;
      updateFile(id, { status: FileUploadingStatusEnum.UPLOADING });
      appendLog(id, "[upload] resuming");

      const counts = chunkCountsRef.current[id];
      const { uploadId, chunks } = uploadState;
      await sendChunksSequentially(
        id,
        uploadId,
        chunks,
        counts?.uploaded ?? 0,
        counts?.total ?? 0,
      );
    },
    [updateFile, appendLog, sendChunksSequentially],
  );

  const handleCancel = useCallback(
    (id: string) => {
      queue.cancel(id);
      abortControllersRef.current[id]?.abort();
      delete abortControllersRef.current[id];
      pausedFlagsRef.current[id] = false;
      delete uploadStatesRef.current[id];
      delete chunkCountsRef.current[id];

      updateFile(id, {
        status: FileUploadingStatusEnum.IDLE,
        progress: 0,
        errorMessage: null,
      });
      appendLog(id, "[upload] cancelled, state reset");
    },
    [updateFile, appendLog, queue],
  );

  const removeFile = useCallback(
    (id: string) => {
      queue.cancel(id);
      abortControllersRef.current[id]?.abort();
      delete abortControllersRef.current[id];
      delete pausedFlagsRef.current[id];
      delete uploadStatesRef.current[id];
      delete chunkCountsRef.current[id];
      delete fileMapRef.current[id];

      const ctx = resumeContextRef.current[id];
      if (ctx) clearResumableUpload(ctx.fileHash);
      delete resumeContextRef.current[id];
      delete fileHashCacheRef.current[id];

      setFiles((prev) => prev.filter((item) => item.id !== id));
    },
    [queue],
  );

  return {
    files,
    addFiles,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
    removeFile,
    handleResumeDetected,
    handleStartFresh,
  };
};

export default useFileUploadChunkedSequential;

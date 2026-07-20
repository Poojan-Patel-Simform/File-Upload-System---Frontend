"use client";

import {
  FileUploadingStatusEnum,
  InitUploadResponse,
  UploadFileItem,
} from "@/types/file";
import { UploadChunk, UploadSession } from "@/types/upload";
import { useRef, useState } from "react";
import useHash from "./useHash";
import { DEFAULT_RETRIES } from "@/constants";
import { generateFileChunks } from "@/lib/chunkService";
import { mapServerStatusToClientStatus } from "@/lib/statusMappingService";
import {
  clearResumableUpload,
  getResumableUpload,
  putResumableUpload,
} from "@/lib/localStorageService";
import api from "@/lib/axios";
import { UploadRecord } from "@/types/upload";

type PropsType = {
  strategy: UploadRecord["strategy"];
  onUploadChunks: UploadChunk;
};

const useFileUploadChunkedBase = ({ strategy, onUploadChunks }: PropsType) => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const { handleGetHash } = useHash();

  const sessionsRef = useRef<Record<string, UploadSession>>({});

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

  const updateProgress = (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    const percent =
      session.totalChunks > 0
        ? Math.round((session.uploadedCount / session.totalChunks) * 100)
        : 0;

    updateFile(id, { progress: percent });

    if (!session.fileHash || !session.uploadId) return;

    putResumableUpload({
      fileHash: session.fileHash,
      fileName: session.file.name,
      fileSize: session.file.size,
      uploadId: session.uploadId,
      totalChunks: session.totalChunks,
      uploadedChunks: session.uploadedCount,
      strategy,
      updatedAt: Date.now(),
    });
  };

  const handleUploadRemainingChunks = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session || !session.uploadId) return;

    const uploadId = session.uploadId;
    const chunks = session.remainingChunks;

    const controller = new AbortController();
    session.controller = controller;

    const result = await onUploadChunks({
      session,
      uploadId,
      chunks,
      controller,
      appendLog: (line) => appendLog(id, line),
      reportChunkUploaded: (chunk) => {
        session.uploadedCount++;
        updateProgress(id);
        appendLog(
          id,
          `[upload] chunk ${chunk.index} uploaded (${session.uploadedCount}/${session.totalChunks})`,
        );
      },
      reportLastChunkClaimed: () => {
        updateFile(id, { status: FileUploadingStatusEnum.MERGING });
        appendLog(
          id,
          "[upload] all chunks sent — server is finalizing (merge + verify)...",
        );
      },
    });

    switch (result.status) {
      case "cancelled":
        appendLog(id, "[upload] cancelled");
        return;

      case "error":
        appendLog(
          id,
          `[upload] failed permanently after ${DEFAULT_RETRIES} retries`,
        );
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: result.error.message,
        });
        return;

      case "paused":
        appendLog(
          id,
          `[upload] paused (${session.uploadedCount}/${session.totalChunks} done)`,
        );
        updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
        return;

      case "completed":
        appendLog(
          id,
          `[upload] complete — ${session.totalChunks}/${session.totalChunks} chunks`,
        );
        updateFile(id, {
          status: FileUploadingStatusEnum.COMPLETED,
          progress: 100,
        });
        clearResumableUpload(session.fileHash);
        return;
    }
  };

  const handleInitializeUploadOnServer = async (
    id: string,
    session: UploadSession,
  ) => {
    const chunks = generateFileChunks(session.file);

    if (!session.fileHash) {
      appendLog(
        id,
        "[hash] computing file hash (SHA-256) for dedup/integrity check...",
      );
      session.fileHash = await handleGetHash(session.file);
      appendLog(id, "[hash] done");
    }

    const response = await api.post("/uploads/init", {
      fileHash: session.fileHash,
      fileName: session.file.name,
      fileSize: session.file.size,
      totalChunks: chunks.length,
    });

    const initData: InitUploadResponse = response.data;
    if (!initData.success) throw new Error("Failed to initialize upload");

    const { uploadId, status: initStatus, uploadedChunks = [] } = initData.data;

    session.uploadId = uploadId;
    session.totalChunks = chunks.length;

    const alreadyCompleted =
      mapServerStatusToClientStatus(initStatus) ===
      FileUploadingStatusEnum.COMPLETED;

    if (alreadyCompleted) {
      appendLog(id, "[upload] file already uploaded, deduplicated");
      session.uploadedCount = chunks.length;
      updateFile(id, {
        status: FileUploadingStatusEnum.COMPLETED,
        progress: 100,
      });
      clearResumableUpload(session.fileHash);
      return { alreadyCompleted: true };
    }

    const alreadyUploadedIndexes = new Set(uploadedChunks);
    session.remainingChunks = chunks.filter(
      (chunk) => !alreadyUploadedIndexes.has(chunk.index),
    );
    session.uploadedCount = alreadyUploadedIndexes.size;
    updateProgress(id);
    appendLog(
      id,
      `[upload] starting — ${alreadyUploadedIndexes.size}/${chunks.length} chunks already on server`,
    );

    return { alreadyCompleted: false };
  };

  const handleUpload = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    updateFile(id, {
      status: FileUploadingStatusEnum.UPLOADING,
      errorMessage: null,
    });
    session.isPaused = false;

    try {
      const { alreadyCompleted } = await handleInitializeUploadOnServer(
        id,
        session,
      );
      if (alreadyCompleted) return;

      await handleUploadRemainingChunks(id);
    } catch (err) {
      appendLog(id, "[upload] init failed");
      updateFile(id, {
        status: FileUploadingStatusEnum.ERROR,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleStartUpload = (id: string) => {
    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      resumableUploadId: undefined,
    });
    handleUpload(id);
  };

  const handleResumeDetected = (id: string) => {
    appendLog(id, "[resume] resuming previous upload");
    handleStartUpload(id);
  };

  const handleStartFresh = async (id: string) => {
    const session = sessionsRef.current[id];
    const record = getResumableUpload(session?.fileHash);

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

    handleStartUpload(id);
  };

  const handlePause = (id: string) => {
    const session = sessionsRef.current[id];
    if (session) session.isPaused = true;
    appendLog(id, "[upload] pause requested");
  };

  const handleResume = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session || !session.uploadId) return;

    session.isPaused = false;
    updateFile(id, { status: FileUploadingStatusEnum.UPLOADING });
    appendLog(id, "[upload] resuming");

    await handleUploadRemainingChunks(id);
  };

  const handleCancel = (id: string) => {
    const session = sessionsRef.current[id];
    session?.controller?.abort();

    if (session) {
      session.isPaused = false;
      session.controller = null;
      session.uploadId = null;
      session.remainingChunks = [];
      session.uploadedCount = 0;
    }

    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      progress: 0,
      errorMessage: null,
    });
    appendLog(id, "[upload] cancelled, state reset");
  };

  const handleRemoveFile = (id: string) => {
    const session = sessionsRef.current[id];
    session?.controller?.abort();
    clearResumableUpload(session?.fileHash);
    delete sessionsRef.current[id];

    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDetectResumableUpload = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    const fileHash = await handleGetHash(session.file);
    session.fileHash = fileHash;

    const record = getResumableUpload(fileHash);
    const hasUnfinishedUpload =
      record !== null && record.uploadedChunks < record.totalChunks;

    if (!hasUnfinishedUpload) {
      handleStartUpload(id);
      return;
    }

    updateFile(id, { resumableUploadId: record.uploadId });
    appendLog(
      id,
      `[resume] resumable upload detected — ${record.uploadedChunks}/${record.totalChunks} chunks already uploaded previously`,
    );
  };

  const handleAddFiles = (newFiles: File[]) => {
    const newItems: UploadFileItem[] = [];

    for (const file of newFiles) {
      const id = crypto.randomUUID();
      sessionsRef.current[id] = {
        file,
        fileHash: null,
        uploadId: null,
        controller: null,
        isPaused: false,
        remainingChunks: [],
        uploadedCount: 0,
        totalChunks: 0,
      };

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
      handleDetectResumableUpload(item.id);
    }
  };

  return {
    files,
    handleAddFiles,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
    handleRemoveFile,
    handleResumeDetected,
    handleStartFresh,
  };
};

export default useFileUploadChunkedBase;

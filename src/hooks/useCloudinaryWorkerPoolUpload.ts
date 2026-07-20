"use client";

import { useRef, useState } from "react";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";
import { CloudinarySession } from "@/types/cloudinary";
import { DEFAULT_RETRIES } from "@/constants";
import {
  signCloudinaryUpload,
  runCloudinaryChunkedUpload,
  createSession,
} from "@/lib/cloudinaryService";
import {
  deleteUploadRecord,
  getUploadRecord,
  saveUploadRecord,
} from "@/lib/indexDbService";

const useCloudinaryWorkerPoolUpload = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  const sessionsRef = useRef<Record<string, CloudinarySession>>({});
  const expiredIdsRef = useRef<Set<string>>(new Set());

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
        ? Math.round((session.completedChunks.size / session.totalChunks) * 100)
        : 0;

    updateFile(id, { progress: percent });
  };

  const handleBeginUpload = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    expiredIdsRef.current.delete(id);
    updateFile(id, {
      status: FileUploadingStatusEnum.UPLOADING,
      errorMessage: null,
    });

    const controller = new AbortController();
    session.controller = controller;

    try {
      appendLog(id, "[sign] requesting Cloudinary signature...");
      session.sign = await signCloudinaryUpload(session.publicId);
      appendLog(id, "[sign] done");
    } catch (err) {
      appendLog(id, "[sign] failed");
      updateFile(id, {
        status: FileUploadingStatusEnum.ERROR,
        errorMessage:
          err instanceof Error ? err.message : "Failed to sign upload",
      });
      return;
    }

    appendLog(
      id,
      `[upload] starting — ${session.completedChunks.size}/${session.totalChunks} chunks already uploaded`,
    );

    const result = await runCloudinaryChunkedUpload({
      file: session.file,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      completedChunks: session.completedChunks,
      sign: session.sign,
      uploadSessionId: session.uploadSessionId,
      controller,
      onChunkComplete: (index) => {
        saveUploadRecord({
          fileKey: session.fileKey,
          uploadSessionId: session.uploadSessionId,
          publicId: session.publicId,
          chunkSize: session.chunkSize,
          totalChunks: session.totalChunks,
          completedChunks: Array.from(session.completedChunks),
        });
        updateProgress(id);
        appendLog(
          id,
          `[upload] chunk ${index} uploaded (${session.completedChunks.size}/${session.totalChunks})`,
        );
      },
      onRetryLog: (chunk, attempt, delayMs) =>
        appendLog(
          id,
          `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${DEFAULT_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
        ),
    });

    switch (result.status) {
      case "completed":
        appendLog(
          id,
          `[upload] complete — ${session.totalChunks}/${session.totalChunks} chunks`,
        );
        await deleteUploadRecord(session.fileKey);
        updateFile(id, {
          status: FileUploadingStatusEnum.COMPLETED,
          progress: 100,
        });
        return;
      case "paused":
        appendLog(
          id,
          `[upload] paused (${session.completedChunks.size}/${session.totalChunks} done)`,
        );
        updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
        return;
      case "expired":
        appendLog(id, "[upload] session expired — restart required");
        expiredIdsRef.current.add(id);
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: "Upload session expired — restart required",
        });
        return;
      case "error":
        appendLog(id, `[upload] failed: ${result.error.message}`);
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: result.error.message,
        });
        return;
    }
  };

  const handleResumeDetected = (id: string) => {
    appendLog(id, "[resume] resuming previous upload");
    updateFile(id, { resumableUploadId: undefined });
    handleBeginUpload(id);
  };

  const handleStartFresh = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    session.controller?.abort();
    await deleteUploadRecord(session.fileKey);
    sessionsRef.current[id] = createSession(session.file);
    appendLog(id, "[resume] starting fresh upload session");
    updateFile(id, { resumableUploadId: undefined, errorMessage: null });
    handleBeginUpload(id);
  };

  // A retry after "expired" can't resume the dead X-Unique-Upload-Id
  // session — it needs a brand new one, same as Start Fresh. Any other
  // retryable error just re-signs and resumes from completedChunks.
  const handleUpload = (id: string) => {
    return expiredIdsRef.current.has(id)
      ? handleStartFresh(id)
      : handleBeginUpload(id);
  };

  const handlePause = (id: string) => {
    appendLog(id, "[upload] pause requested");
    sessionsRef.current[id]?.controller?.abort();
  };

  const handleResume = (id: string) => {
    appendLog(id, "[upload] resuming");
    handleBeginUpload(id);
  };

  const handleCancel = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    expiredIdsRef.current.delete(id);
    session.controller?.abort();
    await deleteUploadRecord(session.fileKey);

    sessionsRef.current[id] = createSession(session.file);
    appendLog(id, "[upload] cancelled, state reset");
    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      progress: 0,
      errorMessage: null,
      resumableUploadId: undefined,
    });
  };

  const handleRemoveFile = (id: string) => {
    sessionsRef.current[id]?.controller?.abort();
    delete sessionsRef.current[id];
    expiredIdsRef.current.delete(id);
    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDetectResumableSession = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    const record = await getUploadRecord(session.fileKey);
    const hasUnfinished =
      record !== undefined &&
      record.completedChunks.length < record.totalChunks;

    if (!hasUnfinished) {
      handleBeginUpload(id);
      return;
    }

    sessionsRef.current[id] = {
      file: session.file,
      fileKey: record.fileKey,
      uploadSessionId: record.uploadSessionId,
      publicId: record.publicId,
      chunkSize: record.chunkSize,
      totalChunks: record.totalChunks,
      completedChunks: new Set(record.completedChunks),
      controller: null,
      sign: null,
    };

    appendLog(
      id,
      `[resume] resumable upload detected — ${record.completedChunks.length}/${record.totalChunks} chunks already uploaded previously`,
    );
    updateFile(id, { resumableUploadId: record.uploadSessionId });
  };

  const handleAddFiles = (newFiles: File[]) => {
    const newItems: UploadFileItem[] = [];

    for (const file of newFiles) {
      const id = crypto.randomUUID();
      sessionsRef.current[id] = createSession(file);
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
      handleDetectResumableSession(item.id);
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

export default useCloudinaryWorkerPoolUpload;

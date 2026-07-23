"use client";

import { useRef, useState } from "react";
import { FileUploadingStatusEnum, UploadFileItem } from "@/types/file";
import { CloudinarySession } from "@/types/cloudinary";
import { DEFAULT_RETRIES } from "@/constants";
import {
  signCloudinaryUpload,
  saveCloudinaryAsset,
  runCloudinaryChunkedUpload,
  createSession,
} from "@/lib/cloudinaryService";
import {
  deleteUploadRecord,
  getUploadRecord,
  saveUploadRecord,
} from "@/lib/indexDbService";
import useHash from "@/hooks/useHash";

const useCloudinaryWorkerPoolUpload = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);

  const sessionsRef = useRef<Record<string, CloudinarySession>>({});
  const expiredIdsRef = useRef<Set<string>>(new Set());
  const { handleGetHash } = useHash();

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

    if (!session.fileHash) {
      try {
        appendLog(id, "[hash] computing file hash...");
        session.fileHash = await handleGetHash(session.file);
        appendLog(id, "[hash] done");
      } catch (err) {
        appendLog(id, "[hash] failed");
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage:
            err instanceof Error ? err.message : "Failed to hash file",
        });
        return;
      }
    }

    try {
      appendLog(id, "[sign] requesting Cloudinary signature...");
      const sign = await signCloudinaryUpload(
        session.publicId,
        session.fileHash,
      );
      appendLog(id, "[sign] done");

      if (sign.duplicate) {
        appendLog(id, "[sign] duplicate file detected — reusing existing asset");
        await deleteUploadRecord(session.fileKey);
        updateFile(id, {
          status: FileUploadingStatusEnum.COMPLETED,
          progress: 100,
          errorMessage: null,
          resultUrl: sign.url,
        });
        return;
      }

      session.sign = sign;
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
      onChunkComplete: (index, chunkResult) => {
        if (chunkResult.done && chunkResult.secure_url) {
          session.resultUrl = chunkResult.secure_url;
        }

        saveUploadRecord({
          fileKey: session.fileKey,
          // fileHash is guaranteed set by this point — hashing always
          // completes before any chunk upload starts.
          fileHash: session.fileHash as string,
          uploadSessionId: session.uploadSessionId,
          publicId: session.publicId,
          chunkSize: session.chunkSize,
          totalChunks: session.totalChunks,
          completedChunks: Array.from(session.completedChunks),
          resultUrl: session.resultUrl,
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
      case "completed": {
        appendLog(
          id,
          `[upload] complete — ${session.totalChunks}/${session.totalChunks} chunks`,
        );

        // Guard against Cancel/Start Fresh swapping in a new session for
        // this id while this call was in flight — don't act on the stale one.
        if (sessionsRef.current[id] !== session) return;

        try {
          appendLog(id, "[save] persisting asset...");
          await saveCloudinaryAsset({
            publicId: session.publicId,
            fileHash: session.fileHash as string,
            url: session.resultUrl as string,
          });
          appendLog(id, "[save] done");

          await deleteUploadRecord(session.fileKey);
          updateFile(id, {
            status: FileUploadingStatusEnum.COMPLETED,
            progress: 100,
            resultUrl: session.resultUrl,
          });
        } catch (err) {
          appendLog(id, "[save] failed");
          updateFile(id, {
            status: FileUploadingStatusEnum.ERROR,
            errorMessage:
              err instanceof Error ? err.message : "Failed to save asset",
          });
        }
        return;
      }
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
    if (!record) {
      handleBeginUpload(id);
      return;
    }

    const restoredSession: CloudinarySession = {
      file: session.file,
      fileKey: record.fileKey,
      fileHash: record.fileHash,
      uploadSessionId: record.uploadSessionId,
      publicId: record.publicId,
      chunkSize: record.chunkSize,
      totalChunks: record.totalChunks,
      completedChunks: new Set(record.completedChunks),
      controller: null,
      sign: null,
      resultUrl: record.resultUrl,
    };
    sessionsRef.current[id] = restoredSession;

    const hasUnfinished = record.completedChunks.length < record.totalChunks;
    if (!hasUnfinished) {
      // All chunks landed on Cloudinary previously but /save was never
      // confirmed — silently retry rather than prompting to resume, since
      // from the user's point of view the upload is already done.
      handleBeginUpload(id);
      return;
    }

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

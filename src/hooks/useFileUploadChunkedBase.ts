"use client";

import { FileUploadingStatusEnum, InitUploadResponse, UploadFileItem } from "@/types/file";
import {
  InitRequest,
  UploadSession,
  UseFileUploadChunkedBaseOptions,
} from "@/types/uploadStrategy";
import { useRef, useState } from "react";
import useHash from "./useHash";
import { CHUNK_RETRIES } from "@/constants/upload";
import { generateFileChunks } from "@/lib/fileProcess";
import { mapServerStatusToClientStatus } from "@/lib/statusMapping";
import {
  clearResumableUpload,
  getResumableUpload,
  putResumableUpload,
} from "@/lib/resumeStore";
import api from "@/lib/axios";

// The default init/resume handshake, used when a strategy doesn't provide
// its own `initRequest` — this is exactly what every strategy did before
// `initRequest` existed, extracted unchanged so behavior stays identical.
const defaultInitRequest: InitRequest = async (session, totalChunks) => {
  const response = await api.post("/uploads/init", {
    fileHash: session.fileHash,
    fileName: session.file.name,
    fileSize: session.file.size,
    totalChunks,
  });

  const initData: InitUploadResponse = response.data;
  if (!initData.success) throw new Error("Failed to initialize upload");

  return {
    status: initData.data.status,
    uploadId: initData.data.uploadId,
    uploadedChunks: initData.data.uploadedChunks ?? [],
  };
};

/**
 * Shared implementation behind the chunked upload hooks (sequential and
 * worker-pool). The two strategies differ only in HOW the remaining chunks
 * for a file are sent — one at a time vs. concurrently through a worker
 * pool — so that part is injected via `sendChunks`. Everything else
 * (hashing, init/resume handshake with the server, progress + resume-store
 * bookkeeping, pause/cancel/remove) lives here once.
 *
 * @returns files - current upload items with status/progress/logs
 * @returns addFiles - add new File objects and kick off hashing + resume detection
 * @returns handleUpload - start (or restart) uploading a file
 * @returns handlePause - request a pause (strategy decides when it takes effect)
 * @returns handleResume - continue a paused upload from its saved chunk snapshot
 * @returns handleCancel - abort and hard-reset a file back to IDLE
 * @returns removeFile - cancel and drop a file from the list entirely
 * @returns handleResumeDetected - resume an upload found in resumeStore from a previous session
 * @returns handleStartFresh - discard a previous session's upload and start over
 */
const useFileUploadChunkedBase = ({
  strategy,
  sendChunks,
  initRequest,
  generateChunks,
}: UseFileUploadChunkedBaseOptions) => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const { handleGetHash } = useHash();

  // One UploadSession per file id. See the UploadSession comment above.
  const sessionsRef = useRef<Record<string, UploadSession>>({});

  // ---------------------------------------------------------------------
  // Step 1 — small helpers for updating a single file's row in `files`.
  // ---------------------------------------------------------------------

  const updateFile = (id: string, patch: Partial<UploadFileItem>) => {
    setFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const appendLogFor = (id: string, line: string) => {
    setFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, logs: [...item.logs, line] } : item,
      ),
    );
  };

  // ---------------------------------------------------------------------
  // Step 2 — progress reporting + saving a resume snapshot to storage.
  //
  // Every time a chunk finishes uploading we recompute the progress % and
  // also write the current position to localStorage (via resumeStore), so
  // that if the user refreshes the page mid-upload, the browser can offer
  // to resume from where it left off.
  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------
  // Step 3 — send the chunks that are still left, delegating the actual
  // send loop (sequential vs. worker-pool) to `sendChunks`, then mapping
  // the reported outcome to the matching status/log/cleanup.
  //
  // This reads directly from session.remainingChunks, so it works both for
  // a brand new upload (handleUpload) and for resuming a paused one
  // (handleResume) — both just call this same function.
  // ---------------------------------------------------------------------

  const sendRemainingChunks = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session || !session.uploadId) return;

    const uploadId = session.uploadId;
    const chunks = session.remainingChunks;

    const controller = new AbortController();
    session.controller = controller;

    const result = await sendChunks({
      session,
      uploadId,
      chunks,
      controller,
      appendLog: (line) => appendLogFor(id, line),
      reportChunkUploaded: (chunk) => {
        session.uploadedCount++;
        updateProgress(id);
        appendLogFor(
          id,
          `[upload] chunk ${chunk.index} uploaded (${session.uploadedCount}/${session.totalChunks})`,
        );
      },
      reportLastChunkClaimed: () => {
        updateFile(id, { status: FileUploadingStatusEnum.MERGING });
        appendLogFor(
          id,
          "[upload] all chunks sent — server is finalizing (merge + verify)...",
        );
      },
    });

    switch (result.status) {
      case "cancelled":
        appendLogFor(id, "[upload] cancelled");
        return;

      case "error":
        appendLogFor(
          id,
          `[upload] failed permanently after ${CHUNK_RETRIES} retries`,
        );
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: result.error.message,
        });
        return;

      case "paused":
        appendLogFor(
          id,
          `[upload] paused (${session.uploadedCount}/${session.totalChunks} done)`,
        );
        updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
        return;

      case "completed":
        // All chunks sent without pausing or failing — the file is fully
        // uploaded and the server has merged it.
        appendLogFor(
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

  // ---------------------------------------------------------------------
  // Step 4 — hash the file (if needed) and ask the server where to start.
  //
  // Returns `{ alreadyCompleted: true }` when the server already has the
  // full file (deduplication) — in that case there is nothing left to
  // upload, and the caller should stop.
  // ---------------------------------------------------------------------

  const initializeUploadOnServer = async (
    id: string,
    session: UploadSession,
  ) => {
    const chunks = (generateChunks ?? generateFileChunks)(session.file);

    if (!session.fileHash) {
      appendLogFor(
        id,
        "[hash] computing file hash (SHA-256) for dedup/integrity check...",
      );
      session.fileHash = await handleGetHash(session.file);
      appendLogFor(id, "[hash] done");
    }

    const result = await (initRequest ?? defaultInitRequest)(
      session,
      chunks.length,
    );

    const { uploadId, status: initStatus, uploadedChunks = [] } = result;

    session.uploadId = uploadId;
    session.totalChunks = chunks.length;
    session.meta = result.meta;

    const alreadyCompleted =
      mapServerStatusToClientStatus(initStatus) ===
      FileUploadingStatusEnum.COMPLETED;

    if (alreadyCompleted) {
      appendLogFor(id, "[upload] file already uploaded, deduplicated");
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
    appendLogFor(
      id,
      `[upload] starting — ${alreadyUploadedIndexes.size}/${chunks.length} chunks already on server`,
    );

    return { alreadyCompleted: false };
  };

  // ---------------------------------------------------------------------
  // Step 5 — the full upload flow for one file: initialize, then send.
  // ---------------------------------------------------------------------

  const handleUpload = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    updateFile(id, {
      status: FileUploadingStatusEnum.UPLOADING,
      errorMessage: null,
    });
    session.isPaused = false;

    try {
      const { alreadyCompleted } = await initializeUploadOnServer(id, session);
      if (alreadyCompleted) return;

      await sendRemainingChunks(id);
    } catch (err) {
      appendLogFor(id, "[upload] init failed");
      updateFile(id, {
        status: FileUploadingStatusEnum.ERROR,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  // Resets a file's row to IDLE and kicks off handleUpload. Used both for
  // brand new files and for restarting after a resume decision is made.
  const startUpload = (id: string) => {
    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      resumableUploadId: undefined,
    });
    handleUpload(id);
  };

  // ---------------------------------------------------------------------
  // Step 6 — adding files: create their sessions/rows, then hash each one
  // to check whether a previous session already has a resumable upload for
  // it. If not, start uploading right away.
  // ---------------------------------------------------------------------

  const detectResumableUpload = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    const fileHash = await handleGetHash(session.file);
    session.fileHash = fileHash;

    const record = getResumableUpload(fileHash);
    const hasUnfinishedUpload =
      record !== null && record.uploadedChunks < record.totalChunks;

    if (!hasUnfinishedUpload) {
      startUpload(id);
      return;
    }

    updateFile(id, { resumableUploadId: record.uploadId });
    appendLogFor(
      id,
      `[resume] resumable upload detected — ${record.uploadedChunks}/${record.totalChunks} chunks already uploaded previously`,
    );
  };

  const addFiles = (newFiles: File[]) => {
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
      detectResumableUpload(item.id);
    }
  };

  // ---------------------------------------------------------------------
  // Step 7 — user actions: resume detected upload, start fresh, pause,
  // resume from pause, cancel, remove.
  // ---------------------------------------------------------------------

  const handleResumeDetected = (id: string) => {
    appendLogFor(id, "[resume] resuming previous upload");
    startUpload(id);
  };

  const handleStartFresh = async (id: string) => {
    const session = sessionsRef.current[id];
    const record = getResumableUpload(session?.fileHash);

    if (record) {
      try {
        await api.delete(`/uploads/${record.uploadId}`);
        appendLogFor(id, "[resume] aborted previous upload on the server");
      } catch {
        appendLogFor(
          id,
          "[resume] could not abort previous upload on the server, continuing anyway",
        );
      }
      clearResumableUpload(record.fileHash);
    }

    startUpload(id);
  };

  const handlePause = (id: string) => {
    const session = sessionsRef.current[id];
    if (session) session.isPaused = true;
    appendLogFor(id, "[upload] pause requested");
  };

  const handleResume = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session || !session.uploadId) return;

    session.isPaused = false;
    updateFile(id, { status: FileUploadingStatusEnum.UPLOADING });
    appendLogFor(id, "[upload] resuming");

    await sendRemainingChunks(id);
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
    appendLogFor(id, "[upload] cancelled, state reset");
  };

  const removeFile = (id: string) => {
    const session = sessionsRef.current[id];
    session?.controller?.abort();
    clearResumableUpload(session?.fileHash);
    delete sessionsRef.current[id];

    setFiles((prev) => prev.filter((item) => item.id !== id));
  };

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

export default useFileUploadChunkedBase;

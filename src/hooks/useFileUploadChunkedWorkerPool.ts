"use client";

import {
  FileUploadingStatusEnum,
  InitUploadResponse,
  UploadFileItem,
} from "@/types/file";
import { useRef, useState } from "react";
import useHash from "./useHash";
import { uploadChunk, CHUNK_RETRIES } from "@/lib/uploadChunk";
import { runChunksInWorkerPool } from "@/lib/chunkRunners/workerPool";
import { generateFileChunks } from "@/lib/fileProcess";
import { mapServerStatusToClientStatus } from "@/lib/statusMapping";
import {
  clearResumableUpload,
  getResumableUpload,
  putResumableUpload,
} from "@/lib/resumeStore";
import api from "@/lib/axios";

type Chunks = ReturnType<typeof generateFileChunks>;

// This hook juggles two separate concerns, each delegated to its own
// module so this file only has to coordinate them:
//   - chunk sending order      -> runChunksInWorkerPool (src/lib/chunkRunners)
//   - surviving a page refresh -> resumeStore (src/lib/resumeStore)

// Everything this hook needs to remember about ONE file while it uploads,
// in a single object. Read it top to bottom like a form: the raw file, the
// hash/upload ids the server gave us, whether we're paused, and how far
// we've gotten. One object per file id — nothing else to keep in sync.
type UploadSession = {
  file: File;
  fileHash: string | null;
  uploadId: string | null;
  controller: AbortController | null;
  isPaused: boolean;
  remainingChunks: Chunks;
  uploadedCount: number;
  totalChunks: number;
};

/**
 * Chunked, worker-pool-strategy file upload hook.
 *
 * For each file: split it into chunks, hash it (SHA-256, for dedup/integrity),
 * ask the server where to start (in case it's seen this file before), then
 * send chunks concurrently via runChunksInWorkerPool — a small pool of
 * workers sized to the detected connection quality. Supports pause/resume
 * and resuming an upload left over from a previous session, same as the
 * sequential strategy.
 *
 * @returns files - current upload items with status/progress/logs
 * @returns addFiles - add new File objects and kick off hashing + resume detection
 * @returns handleUpload - start (or restart) uploading a file
 * @returns handlePause - request a pause; takes effect once in-flight workers finish
 * @returns handleResume - continue a paused upload from its saved chunk snapshot
 * @returns handleCancel - abort and hard-reset a file back to IDLE
 * @returns removeFile - cancel and drop a file from the list entirely
 * @returns handleResumeDetected - resume an upload found in resumeStore from a previous session
 * @returns handleStartFresh - discard a previous session's upload and start over
 */
const useFileUploadChunkedWorkerPool = () => {
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const { handleGetHash } = useHash();

  // One UploadSession per file id. This is the ONLY place per-file upload
  // state lives outside of React state — no more, no other ref to hunt for.
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

  // Recomputes progress % from the session and, if there's an active
  // server-side upload, saves a snapshot so the browser can resume this
  // upload later even after a refresh.
  const reportProgress = (id: string) => {
    const session = sessionsRef.current[id];
    if (!session) return;

    const percent =
      session.totalChunks > 0
        ? Math.round((session.uploadedCount / session.totalChunks) * 100)
        : 0;
    updateFile(id, { progress: percent });

    if (session.fileHash && session.uploadId) {
      putResumableUpload({
        fileHash: session.fileHash,
        fileName: session.file.name,
        fileSize: session.file.size,
        uploadId: session.uploadId,
        totalChunks: session.totalChunks,
        uploadedChunks: session.uploadedCount,
        strategy: "worker-pool",
        updatedAt: Date.now(),
      });
    }
  };

  // Sends whatever is left in session.remainingChunks and updates status
  // once the runner is done. Status state machine (FileUploadingStatusEnum):
  //   UPLOADING -> MERGING   (onLastChunkClaimed, right when the last chunk is claimed)
  //   UPLOADING -> COMPLETED (runner reports "completed")
  //   UPLOADING -> PAUSED    (runner reports "paused")
  //   UPLOADING -> ERROR     (runner reports "error", after CHUNK_RETRIES)
  // handleResume calls this same function again to pick up where it left off.
  const sendRemainingChunks = async (id: string) => {
    const session = sessionsRef.current[id];
    if (!session || !session.uploadId) return;

    const controller = new AbortController();
    session.controller = controller;

    const result = await runChunksInWorkerPool({
      chunks: session.remainingChunks,
      uploadId: session.uploadId,
      signal: controller.signal,
      isPauseRequested: () => session.isPaused,
      uploadChunk,
      onLastChunkClaimed: () => {
        updateFile(id, { status: FileUploadingStatusEnum.MERGING });
        appendLog(
          id,
          "[upload] last chunk claimed — server will finalize (merge + verify) shortly...",
        );
      },
      onChunkUploaded: (chunk) => {
        session.uploadedCount++;
        reportProgress(id);
        appendLog(
          id,
          `[upload] chunk ${chunk.index} uploaded (${session.uploadedCount}/${session.totalChunks})`,
        );
      },
      onChunkRetry: (chunk, attempt, delayMs) =>
        appendLog(
          id,
          `[upload] chunk ${chunk.index} failed (attempt ${attempt}/${CHUNK_RETRIES}), retrying in ${Math.round(delayMs)}ms`,
        ),
    });

    if (result.outcome === "completed") {
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

    if (result.outcome === "paused") {
      session.remainingChunks = result.remainingChunks;
      appendLog(
        id,
        `[upload] paused (${session.uploadedCount}/${session.totalChunks} done)`,
      );
      updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
      return;
    }

    if (result.outcome === "cancelled") {
      appendLog(id, "[upload] cancelled");
      return;
    }

    appendLog(id, `[upload] failed permanently after ${CHUNK_RETRIES} retries`);
    updateFile(id, {
      status: FileUploadingStatusEnum.ERROR,
      errorMessage: result.error.message,
    });
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

      const {
        uploadId,
        status: initStatus,
        uploadedChunks = [],
      } = initData.data;
      session.uploadId = uploadId;
      session.totalChunks = chunks.length;

      if (
        mapServerStatusToClientStatus(initStatus) ===
        FileUploadingStatusEnum.COMPLETED
      ) {
        appendLog(id, "[upload] file already uploaded, deduplicated");
        session.uploadedCount = chunks.length;
        updateFile(id, {
          status: FileUploadingStatusEnum.COMPLETED,
          progress: 100,
        });
        clearResumableUpload(session.fileHash);
        return;
      }

      const alreadyUploadedIndexes = new Set(uploadedChunks);
      session.remainingChunks = chunks.filter(
        (c) => !alreadyUploadedIndexes.has(c.index),
      );
      session.uploadedCount = alreadyUploadedIndexes.size;
      reportProgress(id);
      appendLog(
        id,
        `[upload] starting — ${alreadyUploadedIndexes.size}/${chunks.length} chunks already on server`,
      );

      await sendRemainingChunks(id);
    } catch (err) {
      appendLog(id, "[upload] init failed");
      updateFile(id, {
        status: FileUploadingStatusEnum.ERROR,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const startUpload = (id: string) => {
    updateFile(id, {
      status: FileUploadingStatusEnum.IDLE,
      resumableUploadId: undefined,
    });
    void handleUpload(id);
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
      void (async () => {
        const session = sessionsRef.current[item.id];
        const fileHash = await handleGetHash(item.file);
        session.fileHash = fileHash;

        const record = getResumableUpload(fileHash);
        if (record && record.uploadedChunks < record.totalChunks) {
          updateFile(item.id, { resumableUploadId: record.uploadId });
          appendLog(
            item.id,
            `[resume] resumable upload detected — ${record.uploadedChunks}/${record.totalChunks} chunks already uploaded previously`,
          );
          return;
        }

        startUpload(item.id);
      })();
    }
  };

  const handleResumeDetected = (id: string) => {
    appendLog(id, "[resume] resuming previous upload");
    startUpload(id);
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

    startUpload(id);
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
    appendLog(id, "[upload] cancelled, state reset");
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

export default useFileUploadChunkedWorkerPool;

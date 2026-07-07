"use client";

/**
 * APPROACH 3 — Chunked upload, worker pool
 * File is split into chunks and N workers pull from a SHARED CURSOR,
 * keeping all N concurrency slots busy at all times (no batch-boundary
 * idle time like Promise.all-in-groups-of-5 would have).
 *
 * Trade-offs vs Approach 2 (sequential):
 *  - Fastest on real-world variable-latency connections
 *  - Pause is approximate — up to (CONCURRENCY - 1) chunks may already be
 *    in flight and will complete after pause is requested. Not a
 *    correctness issue (backend dedup handles it), just means the pause
 *    point isn't exact.
 *  - Requires a ref-based cursor since concurrent async closures can't
 *    safely read/write React state directly without stale-closure risk
 *
 * Backend requirement: none beyond what /uploads/init and /uploads/chunk
 * already do — the atomic uploadedChunks increment in a DB transaction on
 * the backend is what makes concurrent chunk writes safe. See the Express
 * uploadChunk handler for that logic.
 */

import {
  ChunkUploadResponse,
  FileUploadingStatusEnum,
  InitUploadResponse,
  UploadStatus,
} from "@/types/file";
import { useRef, useState } from "react";
import useHash from "./useHash";
import { generateFileChunks } from "@/lib/fileProcess";
import api from "@/lib/axios";

const CONCURRENCY = 5;

const useFileUploadChunkedWorkerPool = () => {
  const [file, setFileState] = useState<File | null>(null);
  const [status, setStatus] = useState<FileUploadingStatusEnum>(
    FileUploadingStatusEnum.IDlE,
  );
  const [uploadedCount, setUploadedCount] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const { handleGetHash } = useHash();

  const pausedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadStateRef = useRef<{
    uploadId: string;
    chunks: ReturnType<typeof generateFileChunks>;
  } | null>(null);

  // Shared mutable state read/written by concurrent workers — must be refs,
  // not React state, since workers run inside the same tick-interleaved
  // async closures and state updates are batched/async.
  const cursorRef = useRef(0);
  const uploadedCountRef = useRef(0);

  const progress =
    totalChunks > 0 ? Math.round((uploadedCount / totalChunks) * 100) : 0;

  const runUploadPool = async (
    uploadId: string,
    chunks: ReturnType<typeof generateFileChunks>,
    startCount: number,
    chunkLength: number,
  ) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    cursorRef.current = 0;
    uploadedCountRef.current = startCount;

    // Boxed in an object rather than a bare `let` — TS's control-flow
    // analysis doesn't widen a closure-mutated `let` back to its declared
    // type at the read site below, so `firstError.message` would otherwise
    // type-check as `never`.
    const errorState: { firstError: Error | null } = { firstError: null };
    let wasPaused = false;

    const uploadOne = async (chunk: (typeof chunks)[number]) => {
      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunk.index));
      formData.append("file", chunk.chunk);

      const response = await api.post("/uploads/chunk", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: abortController.signal,
      });

      const chunkData: ChunkUploadResponse = response.data;
      if (!chunkData.success) {
        throw new Error(`Failed to upload chunk ${chunk.index}`);
      }
    };

    // Each worker pulls the next chunk off the shared cursor until the
    // queue empties, pause is requested, or an error/abort stops everything.
    const worker = async () => {
      while (cursorRef.current < chunks.length) {
        if (errorState.firstError || wasPaused) return;

        if (pausedRef.current) {
          wasPaused = true;
          return;
        }

        const chunk = chunks[cursorRef.current++];

        try {
          await uploadOne(chunk);

          uploadedCountRef.current++;
          setUploadedCount(uploadedCountRef.current);
          setLogs((prev) => [
            ...prev,
            `[upload] chunk ${chunk.index} uploaded (${uploadedCountRef.current}/${chunkLength})`,
          ]);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return; // cancel already resets state via handleCancel
          }
          errorState.firstError =
            err instanceof Error ? err : new Error("Unknown upload error");
          setLogs((prev) => [...prev, `[upload] chunk ${chunk.index} failed`]);
          return;
        }
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    if (abortController.signal.aborted) return; // handleCancel already reset state

    if (errorState.firstError) {
      setStatus(FileUploadingStatusEnum.ERROR);
      setErrorMessage(errorState.firstError.message);
      return;
    }

    if (wasPaused || pausedRef.current) {
      // Chunks before the cursor are dispatched (some may still be in
      // flight from other workers), so slicing from the cursor is a safe,
      // possibly slightly conservative resume point.
      const remaining = chunks.slice(cursorRef.current);
      uploadStateRef.current = { uploadId, chunks: remaining };

      setLogs((prev) => [
        ...prev,
        `[upload] paused (${uploadedCountRef.current}/${chunkLength} done)`,
      ]);
      setStatus(FileUploadingStatusEnum.PAUSED);
      return;
    }

    setLogs((prev) => [
      ...prev,
      `[upload] complete — ${uploadedCountRef.current}/${chunkLength} chunks`,
    ]);
    setStatus(FileUploadingStatusEnum.COMPLETED);
    setFileState(null);
    uploadStateRef.current = null;
  };

  const handleUpload = async () => {
    if (!file) return;

    setStatus(FileUploadingStatusEnum.UPLOADING);
    setErrorMessage(null);
    pausedRef.current = false;

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
      setTotalChunks(chunks.length);

      if (initStatus === UploadStatus.COMPLETED) {
        setLogs((prev) => [
          ...prev,
          "[upload] file already uploaded, deduplicated",
        ]);
        setUploadedCount(chunks.length);
        setStatus(FileUploadingStatusEnum.COMPLETED);
        setFileState(null);
        return;
      }

      const alreadyUploaded = new Set(uploadedChunks);
      const remaining = chunks.filter((c) => !alreadyUploaded.has(c.index));

      setUploadedCount(alreadyUploaded.size);
      setLogs((prev) => [
        ...prev,
        `[upload] starting — ${alreadyUploaded.size}/${chunks.length} chunks already on server`,
      ]);

      uploadStateRef.current = { uploadId, chunks: remaining };
      await runUploadPool(
        uploadId,
        remaining,
        alreadyUploaded.size,
        chunks.length,
      );
    } catch (err) {
      setLogs((prev) => [...prev, "[upload] init failed"]);
      setStatus(FileUploadingStatusEnum.ERROR);
      setErrorMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handlePause = () => {
    pausedRef.current = true;
    setLogs((prev) => [...prev, "[upload] pause requested"]);
  };

  // Resumes directly from uploadStateRef — no re-hash, no re-init call.
  const handleResume = async () => {
    if (!uploadStateRef.current) return;

    pausedRef.current = false;
    setStatus(FileUploadingStatusEnum.UPLOADING);
    setLogs((prev) => [...prev, "[upload] resuming"]);

    const { uploadId, chunks } = uploadStateRef.current;
    await runUploadPool(
      uploadId,
      chunks,
      uploadedCountRef.current,
      totalChunks,
    );
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    pausedRef.current = false;
    uploadStateRef.current = null;
    cursorRef.current = 0;
    uploadedCountRef.current = 0;
    setFileState(null);
    setStatus(FileUploadingStatusEnum.IDlE);
    setUploadedCount(0);
    setTotalChunks(0);
    setErrorMessage(null);
    setLogs((prev) => [...prev, "[upload] cancelled, state reset"]);
  };

  // Selecting a new file also clears any leftover status/progress/logs from
  // a previous upload, since the dropzone stays interactive after COMPLETED.
  const handleSetFile = (newFile: File | null) => {
    setFileState(newFile);
    if (newFile) {
      setStatus(FileUploadingStatusEnum.IDlE);
      setErrorMessage(null);
      setUploadedCount(0);
      setTotalChunks(0);
      setLogs([]);
    }
  };

  return {
    file,
    setFile: handleSetFile,
    status,
    handleUpload,
    handlePause,
    handleResume,
    handleCancel,
    progress,
    errorMessage,
    logs,
  };
};

export default useFileUploadChunkedWorkerPool;

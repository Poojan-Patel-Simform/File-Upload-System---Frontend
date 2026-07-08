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
 * Each file uploading gets its own independent worker pool (keyed by file
 * id), so N files uploading concurrently means up to CONCURRENCY * N
 * in-flight chunk requests — an accepted trade-off of full concurrency.
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
  UploadFileItem,
  UploadStatus,
} from "@/types/file";
import { useCallback, useRef, useState } from "react";
import useHash from "./useHash";
import { generateFileChunks } from "@/lib/fileProcess";
import api from "@/lib/axios";

const CONCURRENCY = 5;

type Chunks = ReturnType<typeof generateFileChunks>;

const useFileUploadChunkedWorkerPool = () => {
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

  // Shared mutable cursor per file, read/written by that file's concurrent
  // workers — must be a ref, not React state, since workers run inside
  // tick-interleaved async closures and state updates are batched/async.
  const cursorsRef = useRef<Record<string, number>>({});

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

  const runUploadPool = useCallback(
    async (
      id: string,
      uploadId: string,
      chunks: Chunks,
      startCount: number,
      chunkLength: number,
    ) => {
      const abortController = new AbortController();
      abortControllersRef.current[id] = abortController;

      cursorsRef.current[id] = 0;
      chunkCountsRef.current[id] = { uploaded: startCount, total: chunkLength };

      // Boxed in an object rather than a bare `let` — TS's control-flow
      // analysis doesn't widen a closure-mutated `let` back to its declared
      // type at the read site below, so `firstError.message` would otherwise
      // type-check as `never`.
      const errorState: { firstError: Error | null } = { firstError: null };
      let wasPaused = false;

      const uploadOne = async (chunk: Chunks[number]) => {
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

      // Each worker pulls the next chunk off this file's shared cursor
      // until the queue empties, pause is requested, or an error/abort
      // stops everything.
      const worker = async () => {
        while (cursorsRef.current[id] < chunks.length) {
          if (errorState.firstError || wasPaused) return;

          if (pausedFlagsRef.current[id]) {
            wasPaused = true;
            return;
          }

          const chunk = chunks[cursorsRef.current[id]++];

          try {
            await uploadOne(chunk);

            const counts = chunkCountsRef.current[id];
            const uploaded = (counts?.uploaded ?? 0) + 1;
            setChunkProgress(id, uploaded);
            appendLog(
              id,
              `[upload] chunk ${chunk.index} uploaded (${uploaded}/${chunkLength})`,
            );
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
              return; // cancel already resets state via handleCancel
            }
            errorState.firstError =
              err instanceof Error ? err : new Error("Unknown upload error");
            appendLog(id, `[upload] chunk ${chunk.index} failed`);
            return;
          }
        }
      };

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);

      if (abortController.signal.aborted) return; // handleCancel already reset state

      if (errorState.firstError) {
        updateFile(id, {
          status: FileUploadingStatusEnum.ERROR,
          errorMessage: errorState.firstError.message,
        });
        return;
      }

      const uploadedCount = chunkCountsRef.current[id]?.uploaded ?? 0;

      if (wasPaused || pausedFlagsRef.current[id]) {
        // Chunks before the cursor are dispatched (some may still be in
        // flight from other workers), so slicing from the cursor is a safe,
        // possibly slightly conservative resume point.
        const remaining = chunks.slice(cursorsRef.current[id]);
        uploadStatesRef.current[id] = { uploadId, chunks: remaining };

        appendLog(id, `[upload] paused (${uploadedCount}/${chunkLength} done)`);
        updateFile(id, { status: FileUploadingStatusEnum.PAUSED });
        return;
      }

      appendLog(id, `[upload] complete — ${uploadedCount}/${chunkLength} chunks`);
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
        await runUploadPool(
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
    [handleGetHash, appendLog, updateFile, setChunkProgress, runUploadPool],
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
      await runUploadPool(
        id,
        uploadId,
        chunks,
        counts?.uploaded ?? 0,
        counts?.total ?? 0,
      );
    },
    [updateFile, appendLog, runUploadPool],
  );

  const handleCancel = useCallback(
    (id: string) => {
      abortControllersRef.current[id]?.abort();
      delete abortControllersRef.current[id];
      pausedFlagsRef.current[id] = false;
      delete uploadStatesRef.current[id];
      delete chunkCountsRef.current[id];
      delete cursorsRef.current[id];
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
    delete cursorsRef.current[id];
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

export default useFileUploadChunkedWorkerPool;

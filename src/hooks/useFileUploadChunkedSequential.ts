"use client";

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

const useFileUploadChunkedSequential = () => {
  const [file, setFile] = useState<File | null>(null);
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

  const progress =
    totalChunks > 0 ? Math.round((uploadedCount / totalChunks) * 100) : 0;

  const runUploadLoop = async (
    uploadId: string,
    chunks: ReturnType<typeof generateFileChunks>,
    startCount: number,
    chunkLength: number,
  ) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let completedCount = startCount;

    for (const chunk of chunks) {
      if (pausedRef.current) {
        // Exact pause point — nothing else is in flight, so this is the
        // precise chunk to resume from. This is the main advantage over
        // the worker-pool version.
        uploadStateRef.current = {
          uploadId,
          chunks: chunks.slice(chunks.indexOf(chunk)),
        };

        setLogs((prev) => [
          ...prev,
          `[upload] paused at chunk ${chunk.index} (${completedCount}/${chunkLength} done)`,
        ]);
        setStatus(FileUploadingStatusEnum.PAUSED);
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
        setUploadedCount(completedCount);
        setLogs((prev) => [
          ...prev,
          `[upload] chunk ${chunk.index} uploaded (${completedCount}/${chunkLength})`,
        ]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setLogs((prev) => [
            ...prev,
            `[upload] cancelled at chunk ${chunk.index}`,
          ]);
          return;
        }
        setLogs((prev) => [...prev, `[upload] chunk ${chunk.index} failed`]);
        setStatus(FileUploadingStatusEnum.ERROR);
        setErrorMessage(
          err instanceof Error ? err.message : "Unknown upload error",
        );
        return;
      }
    }

    setLogs((prev) => [
      ...prev,
      `[upload] complete — ${completedCount}/${chunkLength} chunks`,
    ]);
    setStatus(FileUploadingStatusEnum.COMPLETED);
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
      await runUploadLoop(
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
    await runUploadLoop(uploadId, chunks, uploadedCount, totalChunks);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    pausedRef.current = false;
    uploadStateRef.current = null;
    setFile(null);
    setStatus(FileUploadingStatusEnum.IDlE);
    setUploadedCount(0);
    setTotalChunks(0);
    setErrorMessage(null);
    setLogs((prev) => [...prev, "[upload] cancelled, state reset"]);
  };

  return {
    file,
    setFile,
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

export default useFileUploadChunkedSequential;

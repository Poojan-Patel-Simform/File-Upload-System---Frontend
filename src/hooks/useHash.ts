"use client";

import { useCallback, useRef, useState } from "react";
import type { HashWorkerMessage } from "@/workers/hash.worker";

/**
 * Computes a file's SHA-256 hash off the main thread via a Web Worker.
 *
 * @returns hash - the most recently computed hash, or null if none yet
 * @returns isHashing - true while at least one hash job is in flight
 * @returns handleGetHash - hash a File and resolve with the hex digest
 */
const useHash = () => {
  const [hash, setHash] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);

  // Counts concurrently in-flight hash jobs. handleGetHash can be called
  // multiple times before earlier calls resolve (e.g. addFiles hashing
  // several dropped files at once), so isHashing must only flip back to
  // false once the LAST job finishes — otherwise one job's completion would
  // prematurely clear the loading flag while others are still running.
  const hashingCountRef = useRef(0);

  const handleGetHash = useCallback((file: File): Promise<string> => {
    hashingCountRef.current += 1;
    setIsHashing(true);

    return new Promise<string>((resolve, reject) => {
      const worker = new Worker(new URL("../workers/hash.worker", import.meta.url));

      const finish = () => {
        worker.terminate();
        hashingCountRef.current -= 1;
        if (hashingCountRef.current === 0) setIsHashing(false);
      };

      worker.onmessage = (event: MessageEvent<HashWorkerMessage>) => {
        finish();
        if (event.data.type === "done") {
          setHash(event.data.hash);
          resolve(event.data.hash);
        } else {
          reject(new Error(event.data.message));
        }
      };

      worker.onerror = (event) => {
        finish();
        reject(new Error(event.message || "Hashing worker error"));
      };

      worker.postMessage(file);
    });
  }, []);

  return { hash, isHashing, handleGetHash };
};

export default useHash;

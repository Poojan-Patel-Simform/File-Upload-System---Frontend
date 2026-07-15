"use client";

import { useCallback, useRef, useState } from "react";
import type { HashWorkerMessage } from "@/workers/hash.worker";

const useHash = () => {
  const [hash, setHash] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);

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

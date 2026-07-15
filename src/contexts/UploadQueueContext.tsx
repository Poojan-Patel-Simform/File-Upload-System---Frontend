"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createUploadQueue, type UploadQueue } from "@/lib/uploadQueue";

const DEFAULT_MAX_CONCURRENT_FILES = 2;

const UploadQueueContext = createContext<UploadQueue | null>(null);

export const UploadQueueProvider = ({ children }: { children: ReactNode }) => {
  // Lazy initializer so createUploadQueue runs once on mount, not on every
  // render — the queue's internal active/pending state must stay a single
  // instance for the lifetime of the provider.
  const [queue] = useState<UploadQueue>(() =>
    createUploadQueue(DEFAULT_MAX_CONCURRENT_FILES),
  );

  return (
    <UploadQueueContext.Provider value={queue}>
      {children}
    </UploadQueueContext.Provider>
  );
};

/**
 * Accesses the shared upload concurrency queue.
 *
 * @returns the UploadQueue instance from the nearest UploadQueueProvider
 * @throws if called outside an UploadQueueProvider
 */
export const useUploadQueue = (): UploadQueue => {
  const queue = useContext(UploadQueueContext);
  if (!queue) {
    throw new Error(
      "useUploadQueue must be used within an UploadQueueProvider",
    );
  }
  return queue;
};

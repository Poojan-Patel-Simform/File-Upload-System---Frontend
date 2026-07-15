"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createUploadQueue, type UploadQueue } from "@/lib/uploadQueue";

const DEFAULT_MAX_CONCURRENT_FILES = 2;

const UploadQueueContext = createContext<UploadQueue | null>(null);

export const UploadQueueProvider = ({ children }: { children: ReactNode }) => {
  const [queue] = useState<UploadQueue>(() =>
    createUploadQueue(DEFAULT_MAX_CONCURRENT_FILES),
  );

  return (
    <UploadQueueContext.Provider value={queue}>
      {children}
    </UploadQueueContext.Provider>
  );
};

export const useUploadQueue = (): UploadQueue => {
  const queue = useContext(UploadQueueContext);
  if (!queue) {
    throw new Error(
      "useUploadQueue must be used within an UploadQueueProvider",
    );
  }
  return queue;
};

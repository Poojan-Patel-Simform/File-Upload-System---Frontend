"use client";

import { useCallback, useState } from "react";

const useHash = () => {
  const [hash, setHash] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);

  const sha256File = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const handleGetHash = useCallback(async (file: File) => {
    setIsHashing(true);
    try {
      const result = await sha256File(file);
      setHash(result);
      return result;
    } finally {
      setIsHashing(false);
    }
  }, []);

  return { hash, isHashing, handleGetHash };
};

export default useHash;

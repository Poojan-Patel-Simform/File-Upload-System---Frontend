import { UploadRecord } from "@/types/upload";
import { STORAGE_KEY_PREFIX } from "@/constants";

const keyFor = (fileHash: string) => `${STORAGE_KEY_PREFIX}${fileHash}`;

export const getResumableUpload = (
  fileHash: string | null | undefined,
): UploadRecord | null => {
  if (!fileHash || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(fileHash));
    if (!raw) return null;
    return JSON.parse(raw) as UploadRecord;
  } catch {
    return null;
  }
};

export const putResumableUpload = (record: UploadRecord): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      keyFor(record.fileHash),
      JSON.stringify(record),
    );
  } catch {}
};

export const clearResumableUpload = (
  fileHash: string | null | undefined,
): void => {
  if (!fileHash || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(fileHash));
  } catch {}
};

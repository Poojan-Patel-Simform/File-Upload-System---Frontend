/**
 * Convert bytes into a human-readable file size.
 *
 * Examples:
 * formatBytes(1024) => "1 KB"
 * formatBytes(1048576) => "1 MB"
 * formatBytes(1073741824) => "1 GB"
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error("Bytes must be a non-negative number");
  }

  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  const value = bytes / Math.pow(k, i);

  return `${parseFloat(value.toFixed(decimals))} ${units[i]}`;
};

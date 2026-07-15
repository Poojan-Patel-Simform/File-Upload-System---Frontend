export type NetworkHint = {
  concurrency: number;
};

const DEFAULT_CONCURRENCY = 5;

type NetworkInformationLike = {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
};

export const getNetworkHint = (): NetworkHint => {
  if (typeof navigator === "undefined") {
    return { concurrency: DEFAULT_CONCURRENCY };
  }

  const connection = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection;

  // Concurrency tiers keyed to connection quality, so the worker-pool upload
  // strategy doesn't open more parallel chunk requests than a slow
  // connection can actually service.
  switch (connection?.effectiveType) {
    case "slow-2g":
    case "2g":
      return { concurrency: 2 };
    case "3g":
      return { concurrency: 3 };
    default:
      return { concurrency: DEFAULT_CONCURRENCY };
  }
};

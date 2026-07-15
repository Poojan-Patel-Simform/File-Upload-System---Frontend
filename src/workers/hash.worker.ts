export type HashWorkerMessage =
  | { type: "done"; hash: string }
  | { type: "error"; message: string };

const ctx: {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (message: HashWorkerMessage) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} = self as any;

ctx.onmessage = async (event) => {
  const file = event.data;

  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    ctx.postMessage({ type: "done", hash });
  } catch (error) {
    ctx.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown hashing error",
    });
  }
};

export {};

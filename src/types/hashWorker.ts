export type HashWorkerMessage =
  | { type: "done"; hash: string }
  | { type: "error"; message: string };

export type QueueTask = () => Promise<void>;

export type UploadQueue = {
  enqueue: (id: string, task: QueueTask) => void;
  cancel: (id: string) => void;
};

// Closure-based concurrency queue: `active` + `pending` together implement a
// file-level worker pool (the same claim-a-slot pattern the chunk-level
// worker pool uses via cursorsRef, but here gating whole-file uploads instead
// of individual chunks). runNext recurses on task completion to backfill the
// freed slot from the FIFO `pending` array.
export const createUploadQueue = (maxConcurrent: number): UploadQueue => {
  let active = 0;
  const pending: Array<{ id: string; task: QueueTask }> = [];

  const runNext = () => {
    if (active >= maxConcurrent) return;
    const next = pending.shift();
    if (!next) return;

    active++;
    next
      .task()
      .catch(() => {})
      .finally(() => {
        active--;
        runNext();
      });
  };

  return {
    enqueue: (id, task) => {
      pending.push({ id, task });
      runNext();
    },
    cancel: (id) => {
      const index = pending.findIndex((p) => p.id === id);
      if (index !== -1) pending.splice(index, 1);
    },
  };
};

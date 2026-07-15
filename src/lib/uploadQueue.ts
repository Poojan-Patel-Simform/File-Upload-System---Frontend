export type QueueTask = () => Promise<void>;

export type UploadQueue = {
  enqueue: (id: string, task: QueueTask) => void;
  cancel: (id: string) => void;
};

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

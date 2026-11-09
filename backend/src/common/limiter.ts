/** Runs async tasks with at most `concurrency` in flight; the rest wait their turn (FIFO). */
export function createLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const max = Math.max(1, Math.floor(concurrency) || 1);

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      // Wait for a running task to hand its slot over (active stays unchanged on handoff).
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}

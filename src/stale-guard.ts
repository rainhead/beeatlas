// Wraps an async function so that only the most-recently-started call can
// commit its result. Returns null (stale) if a newer call has started since
// this one began — preventing superseded queries from overwriting current state
// and causing downstream work (e.g. MapboxGL re-cluster) on stale data.
export type Guarded<T> = { result: T } | null;

export function makeStaleGuard<T>(): (fn: () => Promise<T>) => Promise<Guarded<T>> {
  let generation = 0;
  return async (fn) => {
    const gen = ++generation;
    const result = await fn();
    return gen === generation ? { result } : null;
  };
}

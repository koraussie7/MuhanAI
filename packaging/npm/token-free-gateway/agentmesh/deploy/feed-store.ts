// KV-backed store with in-memory fallback.
// Keys: "feed:help-needed" | "feed:verify" | "feed:wanted" | "feed:versus" | "feed:rewards" | "feed:teach"
export interface KVLike {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: string): Promise<void>;
}

const memory = new Map<string, unknown>();

export function createFeedStore(kv: KVLike | undefined) {
  async function read<T>(key: string, seed: T): Promise<T> {
    if (!kv) return (memory.get(key) as T | undefined) ?? seed;
    try {
      const raw = (await kv.get(key)) as string | null;
      return raw != null ? (JSON.parse(raw) as T) : seed;
    } catch {
      return seed;
    }
  }
  async function write<T>(key: string, value: T): Promise<void> {
    if (!kv) { memory.set(key, value); return; }
    try { await kv.put(key, JSON.stringify(value)); } catch { /* non-fatal */ }
  }
  /** Read-modify-write helper. */
  async function update<T>(key: string, seed: T, mutate: (value: T) => T | Promise<T>): Promise<T> {
    const current = await read(key, seed);
    const next = await mutate(structuredClone(current));
    await write(key, next);
    return next;
  }
  return { read, write, update };
}

export type FeedStore = ReturnType<typeof createFeedStore>;

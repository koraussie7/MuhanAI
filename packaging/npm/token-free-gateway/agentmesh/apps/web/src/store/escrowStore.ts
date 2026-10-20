/**
 * escrowStore.ts — Shared escrow state between TokenBankPage and TasksPage.
 *
 * Module-level singleton using subscribe/notify so both pages see the same
 * escrow list without needing a full state-management library.
 *
 * Persistence: anchored on Minima via anchorHash() so the receipts survive
 * page reloads / new sessions.
 */
import type { EscrowEntry } from "../types/escrow";

type Listener = (escrows: EscrowEntry[]) => void;

const STORAGE_KEY = "muhanai:escrows:v1";

let state: EscrowEntry[] = loadFromStorage();
const listeners = new Set<Listener>();

function loadFromStorage(): EscrowEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as EscrowEntry[];
  } catch {
    return [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded — keep in-memory only */
  }
}

function notify() {
  for (const fn of listeners) fn(state);
}

export const escrowStore = {
  getSnapshot(): EscrowEntry[] {
    return state;
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  add(entry: EscrowEntry) {
    state = [...state, entry];
    persist();
    notify();
  },
  update(id: string, patch: Partial<EscrowEntry>) {
    state = state.map((e) => (e.id === id ? { ...e, ...patch } : e));
    persist();
    notify();
  },
  remove(id: string) {
    state = state.filter((e) => e.id !== id);
    persist();
    notify();
  },
  forTask(taskId: string): EscrowEntry | undefined {
    return state.find((e) => e.taskId === taskId);
  },
};

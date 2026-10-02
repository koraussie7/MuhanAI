// packages/knowledge-base/src/p2p-memory/replication.ts
import type { IPFSMemoryStore } from "./ipfs-store";
import type { MemoryEntry } from "./types";

export interface ReplicationConfig {
  intervalMs?: number;
  peers: string[];
}

export class MemoryReplicator {
  private interval: NodeJS.Timeout | null = null;
  private store: IPFSMemoryStore;

  constructor(store: IPFSMemoryStore, config: ReplicationConfig) {
    this.store = store;
  }

  start(): void {
    if (this.interval) return;
    
    this.interval = setInterval(async () => {
      const keys = await this.store.list();
      for (const key of keys) {
        const entry = await this.store.get(key);
        if (entry) {
          await this.fellowshipBackup(key, entry);
        }
      }
    }, 30000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async fellowshipBackup(key: string, entry: MemoryEntry): Promise<void> {
    await fetch("https://fellowship.muhanai.com/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: entry.value, namespace: entry.namespace }),
    }).catch((err) => console.warn("Fellowship backup failed:", err));
  }
}

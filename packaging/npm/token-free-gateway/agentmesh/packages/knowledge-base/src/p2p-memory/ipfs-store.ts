// packages/knowledge-base/src/p2p-memory/ipfs-store.ts
import type { MemoryEntry } from "./types";
import { create } from "ipfs-http-client";
import Gun from "gun";
import type { CID } from "multiformats/types";

export interface IPFSStoreConfig {
  endpoint: string;
  repo: string;
  gunPeers: string[];
}

export class IPFSMemoryStore {
  private ipfs: ReturnType<typeof create>;
  private gun: ReturnType<typeof Gun>;
  private repo: string;

  constructor(config: IPFSStoreConfig) {
    this.ipfs = create({ url: config.endpoint });
    this.gun = Gun({
      peers: config.gunPeers,
      file: false,
    });
    this.repo = config.repo;
  }

  async put(key: string, entry: MemoryEntry): Promise<string> {
    const data = JSON.stringify(entry);
    const { cid } = await this.ipfs.add({
      content: data,
    });
    
    await this.gun
      .get(`agents:${this.repo}:memory:${key}`)
      .put({ cid: cid.toString(), timestamp: entry.timestamp });

    await this.ipfs.pin.add(cid);
    
    return cid.toString();
  }

  async get(key: string): Promise<MemoryEntry | null> {
    return new Promise((resolve) => {
      this.gun
        .get(`agents:${this.repo}:memory:${key}`)
        .once(async (meta: { cid: string; timestamp: number }) => {
          if (!meta) {
            resolve(null);
            return;
          }
          
          try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of this.ipfs.cat(meta.cid)) {
              chunks.push(chunk);
            }
            const data = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
            resolve(data as MemoryEntry);
          } catch (err) {
            console.error("Failed to load memory from IPFS:", err);
            resolve(null);
          }
        });
    });
  }

  async list(): Promise<string[]> {
    const keys: string[] = [];
    await new Promise<void>((resolve) => {
      this.gun
        .get(`agents:${this.repo}:memory`)
        .map()
        .once((_val, id) => {
          if (id) keys.push(id);
        });
      setTimeout(resolve, 1000);
    });
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.gun
      .get(`agents:${this.repo}:memory:${key}`)
      .delete();
    await this.ipfs.repo.close();
  }

  async pinCid(cid: string): Promise<void> {
    await this.ipfs.pin.add(cid);
  }
}

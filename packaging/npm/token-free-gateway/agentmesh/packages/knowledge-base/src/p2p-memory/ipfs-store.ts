// packages/knowledge-base/src/p2p-memory/ipfs-store.ts
import type { MemoryEntry } from "./types";
// NOTE: ipfs-http-client / gun are OPTIONAL peer deps — lazy-loaded so that
// `services/api` unit tests (which import @agentmesh/knowledge-base) don't
// fail when those heavy P2P packages aren't installed.
type IPFSClient = {
  add(content: unknown): Promise<{ cid: { toString(): string } }>;
  cat(cid: string): AsyncIterable<Uint8Array>;
  pin: { add(cid: string | { toString(): string }): Promise<void> };
  repo: { close(): Promise<void> };
};
type GunChain = {
  get(key: string): GunChain;
  map(): GunChain;
  once(cb: (data: any, id?: string) => void): void;
  put(data: any): Promise<void> | void;
  delete(): void;
};
type GunInstance = (opts?: unknown) => GunChain;

async function loadIpfsCreate(): Promise<(opts: unknown) => IPFSClient> {
  const mod = (await import("ipfs-http-client")) as unknown as {
    create: (opts: unknown) => IPFSClient;
  };
  return mod.create;
}

async function loadGun(): Promise<GunInstance> {
  const mod = (await import("gun")) as unknown as {
    default?: GunInstance;
  } & GunInstance;
  return (mod.default ?? mod) as GunInstance;
}
import type { CID } from "multiformats/types";
export type { CID };

export interface IPFSStoreConfig {
  endpoint: string;
  repo: string;
  gunPeers: string[];
}

export class IPFSMemoryStore {
  private ipfs: IPFSClient | null = null;
  private gun: GunChain | null = null;
  private initPromise: Promise<void> | null = null;
  private repo: string;
  private config: IPFSStoreConfig;

  constructor(config: IPFSStoreConfig) {
    this.config = config;
    this.repo = config.repo;
  }

  private async ensureInit(): Promise<void> {
    if (this.ipfs && this.gun) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const [create, Gun] = await Promise.all([loadIpfsCreate(), loadGun()]);
        this.ipfs = create({ url: this.config.endpoint });
        this.gun = Gun({
          peers: this.config.gunPeers,
          file: false,
        });
      })();
    }
    await this.initPromise;
  }

  private get clients(): { ipfs: IPFSClient; gun: GunChain } {
    if (!this.ipfs || !this.gun) {
      throw new Error(
        "IPFSMemoryStore not initialized — missing optional deps (ipfs-http-client/gun). Install them to use P2P memory.",
      );
    }
    return { ipfs: this.ipfs, gun: this.gun };
  }

  async put(key: string, entry: MemoryEntry): Promise<string> {
    await this.ensureInit();
    const { ipfs, gun } = this.clients;
    const data = JSON.stringify(entry);
    const { cid } = await ipfs.add({
      content: data,
    });

    await gun
      .get(`agents:${this.repo}:memory:${key}`)
      .put({ cid: cid.toString(), timestamp: entry.timestamp });

    await ipfs.pin.add(cid);

    return cid.toString();
  }

  async get(key: string): Promise<MemoryEntry | null> {
    await this.ensureInit();
    const { ipfs, gun } = this.clients;
    return new Promise((resolve) => {
      gun
        .get(`agents:${this.repo}:memory:${key}`)
        .once(async (meta: { cid: string; timestamp: number }) => {
          if (!meta) {
            resolve(null);
            return;
          }

          try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of ipfs.cat(meta.cid)) {
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
    await this.ensureInit();
    const { gun } = this.clients;
    const keys: string[] = [];
    await new Promise<void>((resolve) => {
      gun
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
    await this.ensureInit();
    const { ipfs, gun } = this.clients;
    await gun
      .get(`agents:${this.repo}:memory:${key}`)
      .delete();
    await ipfs.repo.close();
  }

  async pinCid(cid: string): Promise<void> {
    await this.ensureInit();
    await this.clients.ipfs.pin.add(cid);
  }
}

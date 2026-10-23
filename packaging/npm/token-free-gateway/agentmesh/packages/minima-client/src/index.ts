/// <reference types="node" />
/**
 * @agentmesh/minima-client
 *
 * Minimal Minima blockchain client — RPC + DADA + Anchor.
 * Zero external deps. Uses native fetch (Node 22+ / browser).
 *
 * Public surface:
 *   - MinimaClient: top-level client
 *   - client.rpc.getBlockHeight(), client.rpc.getBlock(h)
 *   - client.dada.getBalance(addr), client.dada.send({from,to,amount,token})
 *   - client.anchor.anchorString(text, namespace), client.anchor.retrieve(cid, ns)
 *
 * Minima RPC API reference: https://docs.minima.global/docs/minima/rpc
 */

export interface MinimaConfig {
  nodeUrl?: string;
  apiKey?: string;
  /** Minima node WebSocket endpoint (dada/mds use it for push updates). */
  wsUrl?: string;
  /** "testnet" | "mainnet" */
  network?: "testnet" | "mainnet";
  /** Injectable fetch for tests (defaults to global fetch) */
  fetch?: typeof fetch;
}

export interface MinimaTransaction {
  txid: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  blockHeight: number;
  confirmed: boolean;
  /** Raw node-reported state, e.g. "confirmed" | "pending" | "failed". */
  status?: string;
}

/**
 * Block header as returned by the Minima `block` RPC.
 *
 * Named `MinimaBlockInfo` because `rpc.ts` imports it under that name; the
 * older `MinimaBlock` shape is kept below for callers already using it.
 */
export interface MinimaBlockInfo {
  block: number;
  difficulty: number;
  hash: string;
  timemilli: number;
  size: number;
  transactions: number;
}

export interface DADABalance {
  address: string;
  token: string;
  amount: string;
}

export interface AnchorResult {
  txid: string;
  hash: string;
  cid: string;
  blockHeight: number;
  namespace: string;
  path: string;
  timestamp: number;
}

export interface MinimaBlock {
  height: number;
  hash: string;
  timestamp: number;
  transactions: MinimaTransaction[];
}

export class MinimaRPCError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "MinimaRPCError";
  }
}

export class MinimaClient {
  private nodeUrl: string;
  private apiKey: string | undefined;
  private fetcher: typeof fetch;
  public rpc: RPCHandle;
  public dada: DADAHandle;
  public anchor: AnchorHandle;

  constructor(config: MinimaConfig = {}) {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    this.nodeUrl = config.nodeUrl ?? env.MINIMA_NODE_URL ?? "http://localhost:9001";
    this.apiKey = config.apiKey ?? env.MINIMA_API_KEY;
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.rpc = new RPCHandle(this);
    this.dada = new DADAHandle(this);
    this.anchor = new AnchorHandle(this);
  }

  /**
   * Low-level RPC call to Minima node
   */
  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

    const url = `${this.nodeUrl.replace(/\/$/, "")}/${method}`;
    const f = this.fetcher ?? globalThis.fetch;
    const res = await f(url, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MinimaRPCError(
        "rpc_error",
        `Minima RPC ${method} failed: ${res.status} ${res.statusText} ${body}`,
        res.status
      );
    }

    const json = (await res.json()) as { result?: T; error?: { code: string; message: string } };
    if (json.error) {
      throw new MinimaRPCError(json.error.code, json.error.message);
    }
    return (json.result ?? (json as unknown as T)) as T;
  }
}

class RPCHandle {
  private client: MinimaClient;
  constructor(client: MinimaClient) {
    this.client = client;
  }

  /** Get current chain tip height */
  async getBlockHeight(): Promise<number> {
    const r = await this.client.call<{ height: number }>("status");
    return r.height;
  }

  /** Get block by height (includes transactions) */
  async getBlock(height: number): Promise<MinimaBlock> {
    return this.client.call<MinimaBlock>("block", { height });
  }
}

class DADAHandle {
  private client: MinimaClient;
  constructor(client: MinimaClient) {
    this.client = client;
  }

  /** Get balance for an address in a token */
  async getBalance(address: string, token = "MINIMA"): Promise<DADABalance> {
    return this.client.call<DADABalance>("balance", { address, token });
  }

  /** Send tokens (requires unlocked key) */
  async send(opts: {
    from: string;
    to: string;
    amount: string;
    token: string;
  }): Promise<MinimaTransaction> {
    return this.client.call<MinimaTransaction>("send", opts);
  }
}

class AnchorHandle {
  private client: MinimaClient;
  constructor(client: MinimaClient) {
    this.client = client;
  }

  /** Anchor arbitrary string content to chain (returns CID = sha256) */
  async anchorString(
    text: string,
    namespace = "default"
  ): Promise<AnchorResult> {
    const cid = await sha256Hex(text);
    const txid = await this.client.call<string>("anchor.create", {
      cid,
      namespace,
      content: text,
    });
    return {
      txid,
      hash: cid,
      cid,
      blockHeight: 0,
      namespace,
      path: `${namespace}/${cid.slice(0, 16)}`,
      timestamp: Date.now(),
    };
  }

  /** Retrieve anchored content by CID */
  async retrieve(cid: string, namespace = "default"): Promise<string> {
    const r = await this.client.call<{ content: string }>("anchor.retrieve", {
      cid,
      namespace,
    });
    return r.content;
  }

  /** List anchored items in namespace */
  async list(namespace = "default", limit = 50): Promise<AnchorResult[]> {
    return this.client.call<AnchorResult[]>("anchor.list", {
      namespace,
      limit,
    });
  }
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createMinimaClient(config: MinimaConfig = {}): MinimaClient {
  return new MinimaClient(config);
}

export function createMinimaClientFromEnv(): MinimaClient {
  return new MinimaClient({
    nodeUrl: ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env?.MINIMA_NODE_URL) ?? "http://localhost:9001",
    apiKey: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env?.MINIMA_API_KEY,
    network: (((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env?.MINIMA_NETWORK) as "testnet" | "mainnet") ?? "testnet",
  });
}

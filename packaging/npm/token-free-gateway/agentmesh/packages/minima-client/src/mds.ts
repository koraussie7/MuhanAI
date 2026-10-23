/**
 * mds.ts — MDS (Minima Data Service) Agent Memory Wrapper
 * 
 * Wraps MDS.cmd store/retrieve/list commands for Agent Memory.
 * Based on /tmp/dada-minima-node/minima/minidapps/agent-memory/service.js
 * RhinoJS (ES5) style — no async/await in MDS callbacks.
 */
import { MinimaConfig } from "./index.js";

export interface MDSConfig {
  nodeUrl: string;
  apiKey?: string;
}

export interface MDSStoreParams {
  cid: string;
  namespace: string;
  path: string;
  size: number;
  timestamp: number;
  address: string;
}

export interface MDSRetrieveParams {
  cid: string;
  namespace: string;
}

export interface MDSListParams {
  namespace: string;
  address?: string;
  limit?: number;
  offset?: number;
}

export interface MDSStoredItem {
  cid: string;
  namespace: string;
  path: string;
  size: number;
  timestamp: number;
  address: string;
  txid: string;
  blockHeight: number;
}

export interface MDSCommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  txid?: string;
}

export interface MDSStoreResult extends MDSCommandResult {
  txid: string;
  blockHeight: number;
  cid: string;
}

export interface MDSListResult extends MDSCommandResult {
  items: MDSStoredItem[];
  total: number;
}

/**
 * MDS Agent Memory Client
 * 
 * Wraps MDS.cmd store/retrieve/list commands.
 * Note: MDS uses RhinoJS (ES5) — callbacks, not async/await.
 * This wrapper provides async/await API over callback-based MDS.
 */
export class MdsAgentMemory {
  private config: MDSConfig;
  private baseUrl: string;
  private authHeader: string;
  private requestId = 0;

  constructor(config: MDSConfig) {
    this.config = config;
    this.baseUrl = `${config.nodeUrl}/mds`;
    const auth = config.apiKey ? `Basic ${btoa(config.apiKey)}` : "";
    this.authHeader = auth;
  }

  private async request<T>(cmd: string, params: Record<string, any> = {}): Promise<MDSCommandResult<T>> {
    const id = ++this.requestId;
    const body = {
      jsonrpc: "2.0",
      id: this.requestId,
      method: "mds.cmd",
      params: { cmd, ...params },
    };
    const res = await fetch(`${this.config.nodeUrl}/mds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey && { Authorization: `Basic ${btoa(this.config.apiKey!)}` }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`MDS ${cmd} failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(`MDS error ${data.error.code}: ${data.error.message}`);
    return { success: true, data: data.result as T };
  }

  /**
   * Store data in MDS (on-chain registration)
   * 
   * MDS.create({
   *   script: "RETURN SIGNEDBY(@INPUT 0)",
   *   amount: 0.001,
   *   state: [address, cid, namespace, timestamp, size, path]
   * })
   * 
   * @param params - Data to store
   * @returns { txid, blockHeight, cid }
   */
  async store(params: MDSStoreParams): Promise<MDSCommandResult<MDSStoreResult>> {
    const state = [
      params.address,
      params.cid,
      params.namespace,
      params.timestamp.toString(),
      params.size.toString(),
      params.path,
    ];
    return this.request<MDSStoreResult>("create", {
      script: "RETURN SIGNEDBY(@INPUT 0)",
      amount: "0.001",
      state,
    });
  }

  /**
   * Retrieve data from MDS by CID
   * 
   * @param params - CID and namespace to retrieve
   * @returns Stored item data
   */
  async retrieve(params: MDSRetrieveParams): Promise<MDSCommandResult<MDSStoredItem>> {
    return this.request<MDSStoredItem>("retrieve", {
      cid: params.cid,
      namespace: params.namespace,
    });
  }

  /**
   * List stored items in namespace
   * 
   * @param params - Namespace and optional filters
   * @returns List of stored items with pagination
   */
  async list(params: MDSListParams): Promise<MDSCommandResult<MDSListResult>> {
    return this.request<MDSListResult>("list", {
      namespace: params.namespace,
      address: params.address,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    });
  }

  /**
   * Delete item from MDS (if supported)
   */
  async delete(cid: string, namespace: string): Promise<MDSCommandResult> {
    return this.request("delete", { cid, namespace });
  }
}

export function createMdsAgentMemory(config: MDSConfig): MdsAgentMemory {
  return new MdsAgentMemory(config);
}

export function createMdsAgentMemoryFromEnv(): MdsAgentMemory {
  const config: MDSConfig = {
    nodeUrl: process.env.MINIMA_NODE_URL ?? "http://localhost:9001",
    apiKey: process.env.MINIMA_API_KEY,
  };
  return new MdsAgentMemory(config);
}

/** Legacy MDS command wrapper (RhinoJS style callback pattern) */
export function mdsCmd<T>(config: MDSConfig, cmd: string, params: Record<string, any> = {}): Promise<MDSCommandResult<T>> {
  const client = new MdsAgentMemory(config);
  // Map high-level methods to MDS commands
  switch (cmd) {
    case "store":
      return client.store(params as any) as Promise<MDSCommandResult<T>>;
    case "retrieve":
      return client.retrieve(params as any) as Promise<MDSCommandResult<T>>;
    case "list":
      return client.list(params as any) as Promise<MDSCommandResult<T>>;
    case "delete":
      return client.delete(params.cid, params.namespace);
    default:
      throw new Error(`Unknown MDS command: ${cmd}`);
  }
}
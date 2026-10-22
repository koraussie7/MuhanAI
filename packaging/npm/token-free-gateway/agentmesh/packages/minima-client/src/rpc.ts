/**
 * rpc.ts — Minima RPC Client
 * 
 * Wraps Minima JSON-RPC API (port 9001) with Basic Auth.
 * Base URL: http://host:9001/rpc
 * Auth: Basic Auth (user:password from config)
 */
import { MinimaConfig, MinimaBlockInfo, MinimaTransaction } from "./index.js";

export interface RpcRequest<T = any> {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: T;
}

export interface RpcResponse<T = any> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: any };
}

/** RPC method parameter types */
export interface GetBalanceParams {
  address: string;
  token?: string;
}

export interface SendParams {
  from: string;
  to: string;
  amount: string;
  token?: string;
  fee?: string;
  memo?: string;
}

export interface GetAddressParams {
  publicKey?: string;
  label?: string;
}

export interface GetBlockParams {
  height?: number;
  hash?: string;
}

/** RPC result types */
export interface RpcBalance {
  confirmed: string;
  unconfirmed: string;
  token: string;
}

export interface RpcSendResult {
  txid: string;
  hash: string;
}

export interface RpcAddress {
  address: string;
  publicKey: string;
  label?: string;
}

export interface RpcBlock {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  transactions: MinimaTransaction[];
}

export class MinimaRpc {
  private config: MinimaConfig;
  private baseUrl: string;
  private authHeader: string;
  private requestId = 0;

  constructor(config: MinimaConfig) {
    this.config = config;
    this.baseUrl = `${config.nodeUrl}/rpc`;
    const auth = config.apiKey ? `Basic ${btoa(config.apiKey)}` : "";
    this.authHeader = auth;
  }

  private async request<T>(method: string, params?: any): Promise<T> {
    const id = ++this.requestId;
    const body: RpcRequest = { jsonrpc: "2.0", id, method, params };
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authHeader && { Authorization: this.authHeader }),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status} ${res.statusText}`);
    const data: RpcResponse<T> = await res.json();
    if (data.error) throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
    return data.result as T;
  }

  /** Get balance for address (optionally specific token) */
  async getBalance(address: string, token?: string): Promise<RpcBalance> {
    return this.request("getbalance", { address, token } as GetBalanceParams);
  }

  /** Send coins from address to address */
  async send(params: SendParams): Promise<RpcSendResult> {
    return this.request("send", params);
  }

  /** Get new address (or from publicKey) */
  async getAddress(publicKey?: string, label?: string): Promise<RpcAddress> {
    return this.request("getaddress", { publicKey, label } as GetAddressParams);
  }

  /** Get block by height or hash */
  async getBlock(height?: number, hash?: string): Promise<RpcBlock> {
    if (!height && !hash) throw new Error("height or hash required");
    return this.request("getblock", { height, hash } as GetBlockParams);
  }

  /** Get latest block height */
  async getBlockHeight(): Promise<number> {
    const block = await this.getBlock();
    return block.height;
  }

  /** Get transaction by txid */
  async getTransaction(txid: string): Promise<MinimaTransaction> {
    return this.request("gettransaction", { txid });
  }

  /** Wait for transaction confirmation */
  async waitForConfirmation(txid: string, confirmations = 1, timeoutMs = 60000): Promise<MinimaTransaction> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const tx = await this.getTransaction(txid);
      if (tx.status === "confirmed") return tx;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`Confirmation timeout for ${txid}`);
  }
}

export function createMinimaRpc(config: MinimaConfig): MinimaRpc {
  return new MinimaRpc(config);
}

export function createMinimaRpcFromEnv(): MinimaRpc {
  const config: MinimaConfig = {
    nodeUrl: process.env.MINIMA_NODE_URL ?? "http://localhost:9001",
    wsUrl: process.env.MINIMA_WS_URL ?? "ws://localhost:9002",
    apiKey: process.env.MINIMA_API_KEY,
    network: (process.env.MINIMA_NETWORK as any) ?? "testnet",
  };
  return new MinimaRpc(config);
}
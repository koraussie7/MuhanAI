/**
 * dada.ts — DADA Token Client for Minima Chain
 * 
 * Handles DADA token balance queries and transfers.
 * DADA_TOKEN_ID must come from environment variable (never hardcoded).
 * 
 * Uses Minima RPC for balance queries and transfers.
 * DADA token is a custom token on Minima chain.
 */
import { MinimaConfig, DADABalance, MinimaTransaction } from "./index.js";
import { MinimaRpc } from "./rpc.js";

export interface DadaConfig extends MinimaConfig {
  /** DADA token ID (from environment, never hardcoded) */
  tokenId?: string;
}

export interface DadaSendParams {
  from: string;
  to: string;
  amount: string;
  fee?: string;
  memo?: string;
}

export interface DadaSendResult {
  txid: string;
  hash: string;
  fee: string;
}

export interface DadaBalanceResult extends DADABalance {
  tokenId: string;
  lastUpdated: number;
}

/**
 * DADA Token Client
 * 
 * Handles DADA token operations on Minima chain.
 * Token ID must be provided via environment variable (DADA_TOKEN_ID).
 * Never hardcode token IDs.
 */
export class DadaClient {
  private rpc: MinimaRpc;
  private tokenId: string;

  constructor(config: DadaConfig) {
    this.rpc = new MinimaRpc({
      nodeUrl: config.nodeUrl,
      wsUrl: config.wsUrl,
      apiKey: config.apiKey,
      network: config.network,
    });
    this.tokenId = config.tokenId ?? process.env.DADA_TOKEN_ID ?? "";
    if (!this.tokenId) {
      throw new Error("DADA_TOKEN_ID must be set in environment or config");
    }
  }

  /**
   * Get DADA token balance for address
   * 
   * @param address - Address to query
   * @returns Balance with token ID and USD value (if available)
   */
  async getBalance(address: string): Promise<DadaBalanceResult> {
    const balance = await this.rpc.getBalance(address, this.tokenId);
    return {
      address,
      token: this.tokenId,
      amount: balance.confirmed,
      usdValue: undefined, // Could be added via price oracle
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get DADA balance for multiple addresses
   */
  async getBalances(addresses: string[]): Promise<DadaBalanceResult[]> {
    return Promise.all(addresses.map(addr => this.getBalance(addr)));
  }

  /**
   * Send DADA tokens
   * 
   * @param params - Send parameters
   * @returns Transaction result with txid
   */
  async send(params: DadaSendParams): Promise<DadaSendResult> {
    const result = await this.rpc.send({
      from: params.from,
      to: params.to,
      amount: params.amount,
      token: this.tokenId,
      fee: params.fee,
      memo: params.memo,
    });
    return {
      txid: result.txid,
      hash: result.hash,
      fee: params.fee ?? "0",
    };
  }

  /**
   * Send DADA and wait for confirmation
   */
  async sendAndConfirm(params: DadaSendParams, confirmations = 1): Promise<{ txid: string; hash: string; confirmed: boolean }> {
    const result = await this.send(params);
    const tx = await this.waitForConfirmation(result.txid, 1);
    return { ...result, confirmed: tx.status === "confirmed" };
  }

  /**
   * Get DADA transaction by txid
   */
  async getTransaction(txid: string): Promise<MinimaTransaction> {
    return this.rpc.getTransaction(txid);
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txid: string, confirmations = 1, timeoutMs = 60000): Promise<MinimaTransaction> {
    return this.rpc.waitForConfirmation(txid, confirmations, timeoutMs);
  }

  /**
   * Get DADA transaction history for address
   */
  async getHistory(address: string, limit = 50): Promise<MinimaTransaction[]> {
    // Would need RPC method gettransactions or similar
    // Placeholder for now
    return [];
  }

  /** Get the DADA token ID being used */
  getTokenId(): string {
    return this.tokenId;
  }
}

export function createDadaClient(config: DadaConfig): DadaClient {
  return new DadaClient(config);
}

export function createDadaClientFromEnv(): DadaClient {
  const tokenId = process.env.DADA_TOKEN_ID;
  if (!tokenId) {
    throw new Error("DADA_TOKEN_ID environment variable not set");
  }
  const config: DadaConfig = {
    nodeUrl: process.env.MINIMA_NODE_URL ?? "http://localhost:9001",
    wsUrl: process.env.MINIMA_WS_URL ?? "ws://localhost:9002",
    apiKey: process.env.MINIMA_API_KEY,
    network: (process.env.MINIMA_NETWORK as any) ?? "testnet",
    tokenId,
  };
  return new DadaClient(config);
}

/**
 * Convenience function to send DADA in one call
 */
export async function sendDada(
  from: string,
  to: string,
  amount: string,
  options: { fee?: string; memo?: string; nodeUrl?: string; apiKey?: string } = {}
): Promise<DadaSendResult> {
  const tokenId = process.env.DADA_TOKEN_ID;
  if (!tokenId) throw new Error("DADA_TOKEN_ID not set");
  
  const config: DadaConfig = {
    nodeUrl: options.nodeUrl ?? process.env.MINIMA_NODE_URL ?? "http://localhost:9001",
    wsUrl: process.env.MINIMA_WS_URL ?? "ws://localhost:9002",
    apiKey: options.apiKey ?? process.env.MINIMA_API_KEY,
    network: (process.env.MINIMA_NETWORK as any) ?? "testnet",
    tokenId,
  };
  const client = new DadaClient(config);
  return client.send({ from, to, amount, fee: options.fee, memo: options.memo });
}

/**
 * Check if DADA token is configured
 */
export function isDadaConfigured(): boolean {
  return !!process.env.DADA_TOKEN_ID;
}
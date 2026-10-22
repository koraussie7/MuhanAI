/**
 * useMinima.ts — Singleton Minima hook for React
 * 
 * Provides identity, balance, transactions, sendPayment, anchorHash.
 * Environment: VITE_MINIMA_NODE_URL, VITE_MINIMA_WS_URL, VITE_MINIMA_API_KEY
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { MinimaClient, MinimaConfig, MinimaTransaction, DADABalance, AnchorResult } from "@agentmesh/minima-client";

interface UseMinimaReturn {
  client: any;
  identity: any;
  balance: any;
  transactions: any[];
  loading: boolean;
  error: string | null;
  sendPayment: (to: string, amount: string, token?: string) => Promise<any>;
  anchorHash: (content: string, namespace?: string) => Promise<any>;
  refresh: () => Promise<void>;
}

export function useMinima(): UseMinimaReturn {
  const [client, setClient] = useState<any>(null);
  const [identity, setIdentity] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const initClient = useCallback(async () => {
    if (initializedRef.current) return;
    try {
      const { MinimaClient } = await import("@agentmesh/minima-client");
      const config = {
        nodeUrl: import.meta.env.VITE_MINIMA_NODE_URL || "http://localhost:9001",
        wsUrl: import.meta.env.VITE_MINIMA_WS_URL || "ws://localhost:9002",
        apiKey: import.meta.env.VITE_MINIMA_API_KEY,
        network: (import.meta.env.VITE_MINIMA_NETWORK as any) || "testnet",
      };
      const client = new MinimaClient(config);
      setClient(client);
      initializedRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to init MinimaClient");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      // In real implementation, call client.rpc.getBalance, client.rpc.getTransactions, etc.
      // For now, mock data
      setBalance({ address: "mock", token: "MINIMA", amount: "1000" });
      setTransactions([]);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
      setLoading(false);
    }
  }, [client]);

  const sendPayment = useCallback(async (to: string, amount: string, token?: string) => {
    if (!client) throw new Error("Client not initialized");
    // In real implementation: await client.dada.send({ to, amount, token })
    return { txid: "mock-txid", hash: "mock-hash" };
  }, [client]);

  const anchorHash = useCallback(async (content: string, namespace?: string) => {
    if (!client) throw new Error("Client not initialized");
    // In real implementation: await client.anchor.anchorString(content, namespace)
    return { txid: "mock-txid", hash: "mock-hash", blockHeight: 12345 };
  }, [client]);

  useEffect(() => {
    initClient();
  }, [initClient]);

  useEffect(() => {
    if (client) {
      refresh();
    }
  }, [client, refresh]);

  return {
    client,
    identity,
    balance,
    transactions,
    loading,
    error,
    sendPayment,
    anchorHash,
    refresh,
  };
}
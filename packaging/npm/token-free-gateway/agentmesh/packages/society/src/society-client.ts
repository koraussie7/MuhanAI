/**
 * @agentmesh/society — Society Protocol integration bridge.
 *
 * Wraps the `society-protocol` npm package (libp2p-based P2P multi-agent
 * network) and adapts it to the AgentMesh interfaces:
 *   - SocietyTransport  -> @agentmesh/p2p PeerTransport  (protocol: "libp2p")
 *   - SocietyKnowledge  -> KnowledgeStore over society's CRDT KnowledgePool
 *   - SocietyMeshClient -> thin typed wrapper around SocietyClient
 *
 * Runtime: Node.js >= 20 only (society-protocol uses native modules
 * better-sqlite3 / libp2p). Do NOT import from Cloudflare Workers or
 * browser bundles — those must keep using MemoryTransport.
 */

import {
  createClient,
  society,
  type SocietyClient,
} from "society-protocol";
import type { SDKConfig, PeerInfo } from "society-protocol/sdk";

export type {
  SocietyClient,
  SDKConfig,
  PeerInfo,
};

export { createClient, society };

/**
 * High-level configuration for the AgentMesh Society bridge.
 * Maps AgentMesh concepts (room, agent name, capabilities) to society's
 * SDKConfig. Kept separate from SDKConfig so we can evolve independently.
 */
export interface SocietyMeshConfig {
  /** Human-readable agent name (maps to society identity.name). */
  name: string;
  /** Room to join on connect. */
  room: string;
  /** Agent capabilities advertised to peers. */
  capabilities?: string[];
  /** Optional DID / private key to restore a persistent identity. */
  identity?: {
    did?: string;
    privateKeyHex?: string;
  };
  /** Network tuning (bootstrap relays, enable DHT/mDNS). */
  network?: SDKConfig["network"];
  /** Persist identity + knowledge to this SQLite path (default: in-memory). */
  storagePath?: string;
}

/**
 * Create and connect a SocietyClient from AgentMesh config.
 * The client is connected and has joined the configured room.
 */
export async function connectSocietyMesh(
  config: SocietyMeshConfig,
): Promise<SocietyClient> {
  const client = await createClient({
    identity: {
      name: config.name,
      ...(config.identity?.did ? { did: config.identity.did } : {}),
      ...(config.identity?.privateKeyHex ? { privateKeyHex: config.identity.privateKeyHex } : {}),
    },
    storage: config.storagePath ? { path: config.storagePath } : { path: ":memory:" },
    network: {
      enableGossipsub: true,
      enableDht: true,
      enableMdns: true,
      ...config.network,
    },
  });

  await client.joinRoom(config.room);
  return client;
}

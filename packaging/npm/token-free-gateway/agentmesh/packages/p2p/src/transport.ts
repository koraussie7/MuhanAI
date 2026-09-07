/**
 * libp2p node construction — folklore/peer-transport.ts port.
 *
 * Pitfalls codified inline (folklore pattern: docs inside the code so the
 * next engineer doesn't have to re-learn them):
 *
 *   PITFALL 1: peer:discovery event ONLY populates peerStore. We MUST
 *              explicitly dial. Without this handler, the node never
 *              connects to anyone (folkore peer-transport.ts:95-110,
 *              17-RESEARCH.md).
 *
 *   PITFALL 2: mDNS bind fails on Docker bridge / WSL2 non-mirrored
 *              multicast. Wrapped in try/catch — Docker users must run
 *              with --network host for mDNS to work.
 *
 *   PITFALL 3: gossipsub 14.x targets @libp2p/interface v2. We use
 *              floodsub (see pubsub.ts) — see ADR-0002.
 *
 *   PITFALL 4: DHT needs identify to populate its routing table. identify()
 *              is always wired.
 *
 *   ANTI-PATTERN: /p2p-circuit listener ONLY when relays configured.
 *              Otherwise noisy dial attempts to nowhere (folkore
 *              peer-transport.ts:160-165).
 */

import { createLibp2p, type Libp2p, type ServiceFactoryMap } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@libp2p/noise";
import { yamux } from "@libp2p/yamux";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { kadDHT } from "@libp2p/kad-dht";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { circuitRelayTransport, circuitRelayServer } from "@libp2p/circuit-relay-v2";
import { dcutr } from "@libp2p/dcutr";
import { uPnPNAT } from "@libp2p/upnp-nat";
import type { PrivateKey, PeerId } from "@libp2p/interface";
import { multiaddr } from "@multiformats/multiaddr";

import { createPubSub } from "./pubsub.js";
import { PeerCatalog, DiscoveryMethod, type PeerCatalogEntry } from "./peer-catalog.js";
import { makeErr, TransportErrorKind, type TransportResult } from "./error.js";
import { TrustVerifier, type VerificationOutcome } from "./trust-verifier.js";
import { PeerReputationRegistry } from "./peer-reputation.js";

export type DiscoveryKind = "mdns" | "bootstrap" | "dht";

export interface TransportConfig {
  privateKey: PrivateKey;
  listen?: string[];
  announce?: string[];
  bootstrapPeers?: string[];
  discovery?: DiscoveryKind[];
  dhtServer?: boolean;
  relayServer?: boolean;
  upnp?: boolean;
  /** Override the protocol prefix for the DHT. Defaults to /agentmesh/kad/1.0.0 */
  dhtProtocol?: string;
}

export interface TransportHandle {
  node: Libp2p;
  peerId: string;
  multiaddrs: string[];
  catalog: PeerCatalog;
  trustVerifier: TrustVerifier;
  reputationRegistry: PeerReputationRegistry;
  stop(): Promise<void>;
}

export async function createTransport(cfg: TransportConfig): Promise<TransportResult<TransportHandle>> {
  const listen = cfg.listen ?? ["/ip4/127.0.0.1/tcp/0"];
  const discovery = cfg.discovery ?? ["mdns"];

  // PITFALL 2: mDNS may fail to bind (Docker bridge / WSL2). Wrap in try/catch.
  const peerDiscovery: Array<ReturnType<typeof mdns> | ReturnType<typeof bootstrap>> = [];
  if (discovery.includes("mdns")) {
    try {
      peerDiscovery.push(mdns({ interval: 20_000 }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`p2p: mDNS unavailable (${(e as Error).message}). Use --network host.`);
    }
  }
  if (discovery.includes("bootstrap") && cfg.bootstrapPeers && cfg.bootstrapPeers.length > 0) {
    peerDiscovery.push(bootstrap({ list: cfg.bootstrapPeers, timeout: 5_000 }));
  }

  // PITFALL 4: DHT needs identify to populate its routing table.
  // ServiceFactoryMap is contravariant in component types — kadDHT requires
  // KadDHTComponents.ping, which TS can't prove is satisfied. Build as a
  // Record and cast at the createLibp2p boundary.
  const services: Record<string, unknown> = {
    identify: identify(),
    ping: ping(),
    dcutr: dcutr(),
    pubsub: createPubSub(),
  };

  if (discovery.includes("dht")) {
    services.dht = kadDHT({
      clientMode: !cfg.dhtServer,
      protocol: cfg.dhtProtocol ?? "/agentmesh/kad/1.0.0",
    });
  }
  if (cfg.relayServer) {
    services.circuitRelay = circuitRelayServer({
      reservations: { maxReservations: 1024, applyDefaultLimit: false },
    });
  }
  if (cfg.upnp !== false) {
    services.upnpNAT = uPnPNAT({ autoConfirmAddress: true });
  }

  // ANTI-PATTERN: /p2p-circuit listener ONLY when relays configured.
  const transports: Array<ReturnType<typeof tcp> | ReturnType<typeof webSockets> | ReturnType<typeof circuitRelayTransport>> = [
    tcp(),
    webSockets(),
  ];
  if (cfg.relayServer || (cfg.bootstrapPeers && cfg.bootstrapPeers.length > 0)) {
    transports.push(circuitRelayTransport());
  }

  let node: Libp2p;
  try {
    node = await createLibp2p({
      privateKey: cfg.privateKey,
      addresses: {
        listen,
        ...(cfg.announce ? { announce: cfg.announce } : {}),
      },
      transports,
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery,
      services: services as ServiceFactoryMap,
      connectionManager: {
        reconnectRetries: Infinity,
        reconnectRetryInterval: 2_000,
        reconnectBackoffFactor: 2,
      },
    });
  } catch (e) {
    return {
      isErr: () => true,
      isOk: () => false,
      error: makeErr(TransportErrorKind.InitFailed, `createLibp2p failed: ${(e as Error).message}`, e),
      value: undefined as never,
    } as never;
  }

  const catalog = new PeerCatalog();
  const trustVerifier = new TrustVerifier();
  const reputationRegistry = new PeerReputationRegistry();

  // PITFALL 1: peer:discovery event handler — explicit dial required.
  node.addEventListener("peer:discovery", (evt) => {
    const detail = evt.detail as { id: PeerId; multiaddrs: Array<{ toString(): string }> };
    if (detail.multiaddrs.length === 0) return;
    const peerIdStr = detail.id.toString();
    if (node.getPeers().some((p) => p.toString() === peerIdStr)) return;

    const method = discovery.includes("bootstrap") && cfg.bootstrapPeers?.some((b) => b.includes(peerIdStr))
      ? DiscoveryMethod.Bootstrap
      : DiscoveryMethod.Mdns;

    catalog.upsert({
      id: peerIdStr,
      addrs: detail.multiaddrs.map((m) => m.toString()),
      addedAt: Date.now(),
      lastSeen: Date.now(),
      discoveryMethod: method,
      tags: { "keep-alive-agentmesh": { value: 50 } },
    });

    // Persist keep-alive tag on the libp2p peer store as well.
    node.peerStore
      .merge(detail.id, { tags: { "keep-alive-agentmesh": { value: 50 } } })
      .catch(() => {
        // best-effort — peer store merge may fail on disconnected peers
      });

    // Explicit dial (folklore peer-transport.ts:95-110).
    const first = detail.multiaddrs[0];
    if (!first) return;
    try {
      void node.dial(multiaddr(String(first))).catch(() => {});
    } catch {
      // already dialing or invalid multiaddr — ignore
    }
  });

  // peer:connect updates lastSeen + triggers TOFU key pin + reputation update
  node.addEventListener("peer:connect", (evt) => {
    const remotePeer = (evt.detail as unknown as { remotePeer: PeerId }).remotePeer;
    const id = remotePeer.toString();
    const existing = catalog.get(id);
    if (existing) {
      existing.lastSeen = Date.now();
    }

    // Fire-and-forget: peerStore.get may not have the publicKey yet (identify
    // service runs async after connect). If present, pin via TOFU; otherwise
    // just record a positive reputation signal so the peer is not penalised
    // for identify latency.
    void node.peerStore
      .get(remotePeer)
      .then((peer) => {
        const pubKey = (peer as unknown as { publicKey?: import("@libp2p/interface").PublicKey }).publicKey;
        const now = Date.now();
        let positive = true;
        if (pubKey) {
          const outcome: VerificationOutcome = trustVerifier.verify(id, pubKey);
          if (outcome.status === "mismatch") {
            // eslint-disable-next-line no-console
            console.warn(`p2p: trust mismatch for ${id} (public key changed)`);
            positive = false;
          }
        }
        reputationRegistry.update("connect", {
          peerId: id,
          positive,
          timestamp: now,
        });
      })
      .catch(() => {
        // best-effort — identify may not have populated peerStore yet
        reputationRegistry.update("connect", {
          peerId: id,
          positive: true,
          timestamp: Date.now(),
        });
      });
  });

  try {
    await node.start();
  } catch (e) {
    return {
      isErr: () => true,
      isOk: () => false,
      error: makeErr(TransportErrorKind.ListenFailed, `node.start failed: ${(e as Error).message}`, e),
      value: undefined as never,
    } as never;
  }

  return {
    isErr: () => false,
    isOk: () => true,
    value: {
      node,
      peerId: node.peerId.toString(),
      multiaddrs: node.getMultiaddrs().map((m) => m.toString()),
      catalog,
      trustVerifier,
      reputationRegistry,
      async stop() {
        await node.stop();
      },
    },
    error: undefined as never,
  } as never;
}

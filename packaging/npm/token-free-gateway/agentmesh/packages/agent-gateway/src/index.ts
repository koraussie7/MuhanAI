/**
 * @agentmesh/gateway — public API.
 *
 * `createGateway()` returns a thin coordinator over:
 *   - @agentmesh/peer-mesh (libp2p host + pubsub + reputation)
 *   - @agentmesh/credit-system (Bayesian-EMA reputation signals)
 *   - this package's SessionRouter (liveness + sticky routing)
 *
 * The gateway is the rendezvous point between:
 *   1. MuhanAI client (mobile/desktop) — initiates sessions
 *   2. muhan-agent — runs on user machines, hosts sessions
 *
 * Architecture (see docs/adr/0002-muhan-gateway.md once written):
 *
 *   client ──HTTPS──> api.muhanai.com ──libp2p──> gateway
 *                                          │
 *                                          ├─> muhan-agent (machine A)
 *                                          └─> muhan-agent (machine B)
 *
 * End-to-end encryption between client and machine; gateway sees only
 * ciphertext + routing metadata.
 */

import type { PrismaClient } from "@prisma/client";
import {
	decodeMessage,
	encodeMessage,
	GATEWAY_PROTOCOL_VERSION,
	GATEWAY_PUBSUB_TOPIC,
	type ProtocolMessage,
	type SignedPayload,
} from "./protocol.js";
import { SessionRouter } from "./routing.js";

export interface GatewayConfig {
	/** libp2p peer-id for this gateway instance. */
	peerId: string;
	/** Prisma handle for credit ledger / reputation lookups. */
	prisma: PrismaClient;
	/** Optional reputation floor; routes skip machines below this. */
	minReputation?: number;
}

export interface GatewayHandle {
	router: SessionRouter;
	publish(msg: SignedPayload<ProtocolMessage>): Promise<void>;
	subscribe(handler: (msg: SignedPayload<ProtocolMessage>) => void): () => void;
	config: Readonly<GatewayConfig>;
}

export function createGateway(config: GatewayConfig): GatewayHandle {
	const router = new SessionRouter();
	const subscribers = new Set<(msg: SignedPayload<ProtocolMessage>) => void>();

	return {
		router,
		config: Object.freeze({ ...config }),
		async publish(msg) {
			const bytes = encodeMessage(msg.message);
			// libp2p wiring is added in a follow-up commit; we keep the
			// interface stable so callers can build against it now.
			if (bytes.byteLength === 0) throw new Error("empty payload");
			for (const fn of subscribers) fn(msg);
		},
		subscribe(handler) {
			subscribers.add(handler);
			return () => subscribers.delete(handler);
		},
	};
}

export type {
	Heartbeat,
	MachineClaim,
	MachinePlatform,
	MachineRecord,
	MachineRevoke,
	ProtocolMessage,
	PushRelay,
	PushTokenHint,
	RoutingDecision,
	SessionAck,
	SessionRoute,
	SignedPayload,
} from "./protocol-types.js";
export {
	heartbeatFromSigned,
	sessionRouteIsFresh,
} from "./routing.js";
export {
	decodeMessage,
	encodeMessage,
	GATEWAY_PROTOCOL_VERSION,
	GATEWAY_PUBSUB_TOPIC,
	SessionRouter,
};

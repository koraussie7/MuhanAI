/**
 * Re-export of public types. Kept separate from index.ts so the
 * runtime surface (protocol.ts, routing.ts) stays decoupled from
 * the type-only public contract.
 */

export type {
	Heartbeat,
	MachineClaim,
	MachinePlatform,
	MachineRevoke,
	ProtocolMessage,
	PushRelay,
	PushTokenHint,
	SessionAck,
	SessionRoute,
	SignedPayload,
} from "./protocol.js";

export type { MachineRecord, RoutingDecision } from "./routing.js";

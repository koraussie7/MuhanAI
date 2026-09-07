/**
 * Re-export of public types. Kept separate from index.ts so the
 * runtime surface (protocol.ts, routing.ts) stays decoupled from
 * the type-only public contract.
 */

export type {
  ProtocolMessage,
  SignedPayload,
  MachineClaim,
  MachineRevoke,
  SessionRoute,
  SessionAck,
  PushRelay,
  Heartbeat,
  PushTokenHint,
  MachinePlatform,
} from "./protocol.js";

export type { MachineRecord, RoutingDecision } from "./routing.js";

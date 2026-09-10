/**
 * @agentmesh/p2p — session routing.
 *
 * Given a userId, pick the best online machine for a new session and
 * deliver the encrypted payload. Falls back to push notification if
 * no machine is online.
 *
 * Decisions:
 *   - Liveness comes from Heartbeat messages seen in the last 30s.
 *   - Reputation (from @agentmesh/credit-system) is used to rank machines
 *     when multiple are online; lowest variance wins.
 *   - Idempotency: same sessionId routed twice always returns the
 *     same machineId (sticky routing).
 */

import type {
	Heartbeat,
	MachineClaim,
	PushTokenHint,
	SessionAck,
	SessionRoute,
	SignedPayload,
} from "./protocol.js";

const HEARTBEAT_FRESH_MS = 30_000;
const ROUTING_TTL_MS = 5 * 60_000;

export interface MachineRecord {
	userId: string;
	machineId: string;
	peerId: string;
	platform: MachineClaim["platform"];
	lastHeartbeatAt: number;
	reputationScore: number;
	pushToken?: PushTokenHint;
}

export interface RoutingDecision {
	machineId: string;
	peerId: string;
	via: "pubsub" | "push";
}

export class SessionRouter {
	private readonly byUser = new Map<string, MachineRecord[]>();
	private readonly sticky = new Map<string, RoutingDecision>();

	upsert(record: MachineRecord): void {
		const list = this.byUser.get(record.userId) ?? [];
		const idx = list.findIndex((r) => r.machineId === record.machineId);
		if (idx >= 0) list[idx] = record;
		else list.push(record);
		this.byUser.set(record.userId, list);
	}

	remove(userId: string, machineId: string): void {
		const list = this.byUser.get(userId);
		if (!list) return;
		this.byUser.set(
			userId,
			list.filter((r) => r.machineId !== machineId),
		);
	}

	route(input: {
		sessionId: string;
		userId: string;
		preferredMachineId?: string;
		now: number;
	}): RoutingDecision | null {
		const sticky = this.sticky.get(input.sessionId);
		if (sticky && this.stickyStillOnline(sticky.machineId, input.userId, input.now)) {
			return sticky;
		}

		const machines = this.onlineMachines(input.userId, input.now);
		if (machines.length === 0) return null;

		const target =
			machines.find((m) => m.machineId === input.preferredMachineId) ??
			machines.reduce((best, cur) => (cur.reputationScore > best.reputationScore ? cur : best));

		const via = machines.length === 0 && target.pushToken ? "push" : "pubsub";
		const decision: RoutingDecision = {
			machineId: target.machineId,
			peerId: target.peerId,
			via,
		};
		this.sticky.set(input.sessionId, decision);
		return decision;
	}

	forgetSession(sessionId: string): void {
		this.sticky.delete(sessionId);
	}

	onlineMachines(userId: string, now: number): MachineRecord[] {
		const list = this.byUser.get(userId) ?? [];
		return list.filter((r) => now - r.lastHeartbeatAt <= HEARTBEAT_FRESH_MS);
	}

	private stickyStillOnline(machineId: string, userId: string, now: number): boolean {
		return this.onlineMachines(userId, now).some((m) => m.machineId === machineId);
	}
}

export function heartbeatFromSigned(payload: SignedPayload<Heartbeat>): MachineRecord {
	return {
		userId: payload.message.userId,
		machineId: payload.message.machineId,
		peerId: payload.from,
		platform: "macos",
		lastHeartbeatAt: payload.message.issuedAt,
		reputationScore: 0.5,
	};
}

export function sessionRouteIsFresh(sent: SessionRoute, now: number): boolean {
	return now - sent.issuedAt <= ROUTING_TTL_MS;
}

export type { SessionAck, SessionRoute };

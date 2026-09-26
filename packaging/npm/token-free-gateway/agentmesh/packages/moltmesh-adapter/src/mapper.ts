/**
 * AgentCard → AgentMesh view mapping.
 *
 * Pure and offline-testable (see `mapper.test.ts`), so dashboard shapes can be
 * validated without a running MoltMesh daemon.
 */

import type { AgentCapability, AgentDescriptor, AgentType } from "@agentmesh/core";
import type { AgentCard, MoltmeshSkill } from "./types.ts";

export const CAPABILITY_PREFIX = "a2a:v1:cap:";

/** Capability ids in a card, with the `a2a:v1:cap:` prefix stripped. */
export function capabilityNames(card: AgentCard): string[] {
	return card.skills.map((skill: MoltmeshSkill) =>
		skill.id.startsWith(CAPABILITY_PREFIX) ? skill.id.slice(CAPABILITY_PREFIX.length) : skill.id,
	);
}

/**
 * Map a free-form MoltMesh capability onto AgentMesh's vocabulary.
 *
 * `AgentCapability` is an open union (`string & {}`), so unrecognised names
 * pass through unchanged and stay searchable rather than being dropped.
 */
export function capabilityToAgentCapability(name: string): AgentCapability {
	const lower = name.toLowerCase();
	if (lower.includes("answer") || lower.includes("chat")) return "answer";
	if (lower.includes("verify")) return "verify";
	if (lower.includes("teach")) return "teach";
	if (lower.includes("knowledge")) return "local_knowledge";
	return name as AgentCapability;
}

/** MoltMesh peers are code, not people → `llm` unless the card says otherwise. */
export function inferAgentType(card: AgentCard): AgentType {
	const names = capabilityNames(card).map((name) => name.toLowerCase());
	if (names.some((name) => name.includes("search") || name.includes("web"))) {
		return "search";
	}
	if (names.some((name) => name.includes("compute") || name.includes("gpu"))) {
		return "compute";
	}
	return "llm";
}

export interface AgentCardToDescriptorOptions {
	/** RTT measured elsewhere (e.g. the `Ping` RPC). Defaults to 0 = unknown. */
	latencyMs?: number;
	/** Overrides the card's own liveness signal. */
	online?: boolean;
	/** Injectable clock, for deterministic tests. */
	now?: number;
}

/**
 * Project an `AgentCard` into the shape `registry.descriptors()` returns, so a
 * remote MoltMesh peer is indistinguishable from a local adapter on the
 * dashboard.
 *
 * Liveness is derived from the card's `expiresAt` unless overridden: an expired
 * card means the publisher stopped refreshing presence.
 */
export function agentCardToDescriptor(
	card: AgentCard,
	options: AgentCardToDescriptorOptions = {},
): AgentDescriptor {
	const now = options.now ?? Date.now();
	const expiresAt = Number(card.expiresAt) || 0;
	const fresh = expiresAt === 0 || expiresAt > now;
	const latencyMs = options.latencyMs ?? 0;
	return {
		id: `moltmesh:${card.did}`,
		name: card.name || card.did,
		type: inferAgentType(card),
		capabilities: capabilityNames(card).map(capabilityToAgentCapability),
		cost: 0,
		latencyMs,
		health: {
			online: options.online ?? fresh,
			latency: latencyMs,
			checkedAt: now,
		},
	};
}

/** `a2a:v1:cap:code-review` → `code review`. */
export function capabilityTitle(skillId: string): string {
	const bare = skillId.startsWith(CAPABILITY_PREFIX)
		? skillId.slice(CAPABILITY_PREFIX.length)
		: skillId;
	return bare.replace(/[-_]+/g, " ");
}

/** MoltMesh DIDs are `did:key:<multibase>`; used to reject obvious garbage. */
export function isMoltmeshDid(value: string): boolean {
	return value.startsWith("did:key:") && value.length > "did:key:".length;
}

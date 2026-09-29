/**
 * Contract gate for the registry/discovery shared types.
 *
 * These shapes are the cross-track contract (see
 * `docs/agentmesh/REGISTRY-A2A-WORK-PLAN.md` pre-work 0.6): R1 stores
 * `ResourceDescriptor` rows, R2 discovers them, R3 turns `kind: "agent"`
 * rows into Agent Cards. Any drift here breaks two packages at once, so
 * the tests pin the serialisable surface: what parses out of JSON must
 * be exactly what went in.
 *
 * `riskLevel` and `metadata` are the two fields that historically got
 * dropped in projections — the round-trip test below exists to make
 * that regression impossible.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ResourceDescriptor } from "../resource.js";

const VALID_RISK_LEVELS = ["low", "medium", "high"] as const satisfies ReadonlyArray<
	import("../index.js").RiskLevel
>;

function makeDescriptor(overrides: Partial<ResourceDescriptor> = {}): ResourceDescriptor {
	return {
		id: "res-1",
		kind: "mcp",
		name: "demo-tool",
		description: "contract gate fixture",
		capabilities: ["ssh-exec", "gguf"],
		endpoint: "http://127.0.0.1:4000",
		protocol: "mcp",
		status: "online",
		riskLevel: "medium",
		visibility: "shared",
		ownerId: "owner-7",
		metadata: {
			region: "ap-northeast-2",
			tenancy: { type: "shared" },
			labels: ["prod", "canary"],
		},
		createdAt: 1_700_000_000_000,
		updatedAt: 1_700_000_000_001,
		lastSeen: 1_700_000_000_001,
		...overrides,
	};
}

test("ResourceDescriptor: riskLevel and metadata survive a JSON round-trip", () => {
	const descriptor = makeDescriptor({
		riskLevel: "high",
		metadata: {
			region: "ap-northeast-2",
			tenancy: { type: "shared" },
			labels: ["prod", "canary"],
		},
	});

	const roundTripped = JSON.parse(JSON.stringify(descriptor)) as ResourceDescriptor;

	assert.equal(roundTripped.riskLevel, "high");
	assert.equal(roundTripped.riskLevel, descriptor.riskLevel);
	assert.deepEqual(roundTripped.metadata, descriptor.metadata);
	// All risk levels the enum declares must parse back identically.
	for (const risk of VALID_RISK_LEVELS) {
		const restored = JSON.parse(
			JSON.stringify(makeDescriptor({ riskLevel: risk })),
		) as ResourceDescriptor;
		assert.equal(restored.riskLevel, risk);
	}
});

test("ResourceDescriptor: required fields keep their exact types through JSON", () => {
	const descriptor = makeDescriptor();
	const roundTripped = JSON.parse(JSON.stringify(descriptor)) as ResourceDescriptor;

	assert.equal(roundTripped.id, "res-1");
	assert.equal(roundTripped.kind, "mcp");
	assert.equal(roundTripped.status, "online");
	assert.equal(roundTripped.visibility, "shared");
	assert.equal(roundTripped.ownerId, "owner-7");
	assert.deepEqual(roundTripped.capabilities, ["ssh-exec", "gguf"]);
	assert.equal(roundTripped.createdAt, 1_700_000_000_000);
	assert.ok(Array.isArray(roundTripped.capabilities));
});

test("ResourceDescriptor: optional fields are absent, not undefined, when omitted", () => {
	const descriptor = makeDescriptor({ riskLevel: undefined, metadata: undefined });
	const json = JSON.stringify(descriptor);
	const parsed = JSON.parse(json) as ResourceDescriptor;

	assert.equal("riskLevel" in parsed, false);
	assert.equal("metadata" in parsed, false);
});
import { describe, expect, it } from "vitest";

import { DEFAULT_SUBJECT, PeerReputationRegistry } from "../peer-reputation.js";

function signal(
	overrides: Partial<{
		peerId: string;
		positive: boolean;
		weight: number;
		timestamp: number;
	}> = {},
) {
	return {
		peerId: overrides.peerId ?? "peer-A",
		positive: overrides.positive ?? true,
		weight: overrides.weight ?? 1.0,
		timestamp: overrides.timestamp ?? 1,
	};
}

describe("PeerReputationRegistry — update creates subject map on first signal", () => {
	it("creates a new subject bucket on first signal for that subject", () => {
		const reg = new PeerReputationRegistry();
		expect(reg.subjectsForPeer("peer-A")).toEqual([]);
		reg.update("chat", signal({ peerId: "peer-A" }));
		expect(reg.subjects()).toContain("chat");
		expect(reg.peersForSubject("chat")).toEqual(["peer-A"]);
	});

	it("does not create subject map for an unrelated peer", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A" }));
		expect(reg.subjectsForPeer("peer-B")).toEqual([]);
	});
});

describe("PeerReputationRegistry — same peer in two subjects → independent scores", () => {
	it("tracks independent (α, β) per (subject, peer) cell", () => {
		const reg = new PeerReputationRegistry();
		// peer-A is great at chat (5 positive, 1 negative) but bad at compute (1 positive, 5 negative)
		for (let i = 0; i < 5; i++) {
			reg.update("chat", signal({ peerId: "peer-A", positive: true, timestamp: i }));
		}
		reg.update("chat", signal({ peerId: "peer-A", positive: false, timestamp: 5 }));

		for (let i = 0; i < 1; i++) {
			reg.update("compute", signal({ peerId: "peer-A", positive: true, timestamp: 10 + i }));
		}
		for (let i = 0; i < 5; i++) {
			reg.update("compute", signal({ peerId: "peer-A", positive: false, timestamp: 11 + i }));
		}

		const chat = reg.reputationFor("chat", "peer-A")!;
		const compute = reg.reputationFor("compute", "peer-A")!;
		expect(chat.score).toBeGreaterThan(compute.score);
		// α=6, β=2 → mean = 6/8 = 0.75
		expect(chat.score).toBeCloseTo(6 / 8, 5);
		// α=2, β=6 → mean = 2/8 = 0.25
		expect(compute.score).toBeCloseTo(2 / 8, 5);
	});
});

describe("PeerReputationRegistry — reputationFor undefined for unknown subject", () => {
	it("returns undefined for unknown subject", () => {
		const reg = new PeerReputationRegistry();
		expect(reg.reputationFor("ghost-subject", "peer-A")).toBeUndefined();
	});

	it("returns undefined for unknown peer in a known subject", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A" }));
		expect(reg.reputationFor("chat", "peer-B")).toBeUndefined();
	});

	it("returns PeerReputation when (subject, peer) is known", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A", timestamp: 100 }));
		const r = reg.reputationFor("chat", "peer-A");
		expect(r).toBeDefined();
		expect(r?.subject).toBe("chat");
		expect(r?.peerId).toBe("peer-A");
		expect(r?.updatedAt).toBe(100);
	});
});

describe("PeerReputationRegistry — score ∈ [0, 1]", () => {
	it("returns score in [0, 1] after a single positive signal", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A", positive: true }));
		const r = reg.reputationFor("chat", "peer-A")!;
		expect(r.score).toBeGreaterThanOrEqual(0);
		expect(r.score).toBeLessThanOrEqual(1);
	});

	it("returns score in [0, 1] after many positive signals", () => {
		const reg = new PeerReputationRegistry();
		for (let i = 0; i < 100; i++) {
			reg.update("chat", signal({ peerId: "peer-A", positive: true, timestamp: i }));
		}
		const r = reg.reputationFor("chat", "peer-A")!;
		expect(r.score).toBeGreaterThanOrEqual(0);
		expect(r.score).toBeLessThanOrEqual(1);
	});

	it("returns score in [0, 1] after many negative signals", () => {
		const reg = new PeerReputationRegistry();
		for (let i = 0; i < 100; i++) {
			reg.update("chat", signal({ peerId: "peer-A", positive: false, timestamp: i }));
		}
		const r = reg.reputationFor("chat", "peer-A")!;
		expect(r.score).toBeGreaterThanOrEqual(0);
		expect(r.score).toBeLessThanOrEqual(1);
	});

	it("variance is non-negative and bounded", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A" }));
		const r = reg.reputationFor("chat", "peer-A")!;
		expect(r.variance).toBeGreaterThanOrEqual(0);
		// variance = αβ / ((α+β)²(α+β+1)) — for α=β=2 → 4 / (16·3) = 1/12 ≈ 0.0833
		expect(r.variance).toBeLessThanOrEqual(1);
	});
});

describe("PeerReputationRegistry — subjectsForPeer", () => {
	it("returns subjects where a peer has signals", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A" }));
		reg.update("compute", signal({ peerId: "peer-A" }));
		reg.update("chat", signal({ peerId: "peer-B" }));
		expect(reg.subjectsForPeer("peer-A").sort()).toEqual(["chat", "compute"]);
		expect(reg.subjectsForPeer("peer-B")).toEqual(["chat"]);
	});

	it("returns empty array for peer with no signals", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A" }));
		expect(reg.subjectsForPeer("ghost")).toEqual([]);
	});
});

describe("PeerReputationRegistry — DEFAULT_SUBJECT", () => {
	it(`DEFAULT_SUBJECT === "*"`, () => {
		expect(DEFAULT_SUBJECT).toBe("*");
	});

	it("DEFAULT_SUBJECT works as a normal subject key", () => {
		const reg = new PeerReputationRegistry();
		reg.update(DEFAULT_SUBJECT, signal({ peerId: "peer-A" }));
		expect(reg.reputationFor(DEFAULT_SUBJECT, "peer-A")?.subject).toBe("*");
	});
});

describe("PeerReputationRegistry — aggregate helpers", () => {
	it("size counts (subject, peer) cells", () => {
		const reg = new PeerReputationRegistry();
		expect(reg.size()).toBe(0);
		reg.update("chat", signal({ peerId: "peer-A" }));
		reg.update("chat", signal({ peerId: "peer-B" }));
		reg.update("compute", signal({ peerId: "peer-A" }));
		expect(reg.size()).toBe(3);
	});

	it("all returns snapshot of every (subject, peer) cell", () => {
		const reg = new PeerReputationRegistry();
		reg.update("chat", signal({ peerId: "peer-A", timestamp: 1 }));
		reg.update("compute", signal({ peerId: "peer-A", timestamp: 2 }));
		const snap = reg.all();
		expect(snap.length).toBe(2);
		const subjects = snap.map((r) => r.subject).sort();
		expect(subjects).toEqual(["chat", "compute"]);
	});

	it("getStore returns the injected store", () => {
		const reg = new PeerReputationRegistry();
		expect(reg.getStore()).toBeDefined();
		expect(typeof reg.getStore().size).toBe("function");
	});
});

describe("PeerReputationRegistry — accepts injected ReputationStore", () => {
	it("keeps the injected store reference (for Phase 4+ persistence wiring)", () => {
		const reg = new PeerReputationRegistry();
		const store = reg.getStore();
		expect(store).toBeDefined();
		expect(typeof store.size).toBe("function");
		// per-cell state lives in `states`, NOT in the shared store
		expect(store.size()).toBe(0);
		reg.update("chat", signal({ peerId: "peer-A" }));
		expect(store.size()).toBe(0);
	});

	it("uses default store when none is injected", () => {
		const reg = new PeerReputationRegistry();
		expect(reg.getStore()).toBeDefined();
	});
});

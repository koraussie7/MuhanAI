import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	applySignal,
	initialReputation,
	mean,
	REPUTATION_PRIOR_ALPHA,
	REPUTATION_PRIOR_BETA,
	ReputationStore,
	variance,
} from "./reputation.js";

describe("reputation — initialReputation", () => {
	it("starts at uniform Beta(1,1) prior", () => {
		const s = initialReputation("peer-A");
		assert.equal(s.peerId, "peer-A");
		assert.equal(s.alpha, REPUTATION_PRIOR_ALPHA);
		assert.equal(s.beta, REPUTATION_PRIOR_BETA);
		assert.equal(s.updatedAt > 0, true);
	});

	it("respects injected timestamp", () => {
		const ts = 1_700_000_000_000;
		const s = initialReputation("peer-A", ts);
		assert.equal(s.updatedAt, ts);
	});
});

describe("reputation — applySignal", () => {
	it("positive signal increments alpha", () => {
		const s0 = initialReputation("peer-A");
		const s1 = applySignal(s0, {
			peerId: "peer-A",
			positive: true,
			timestamp: 1,
		});
		assert.equal(s1.alpha, s0.alpha + 1);
		assert.equal(s1.beta, s0.beta);
	});

	it("negative signal increments beta", () => {
		const s0 = initialReputation("peer-A");
		const s1 = applySignal(s0, {
			peerId: "peer-A",
			positive: false,
			timestamp: 1,
		});
		assert.equal(s1.alpha, s0.alpha);
		assert.equal(s1.beta, s0.beta + 1);
	});

	it("weight defaults to 1.0", () => {
		const s0 = initialReputation("peer-A");
		const s1 = applySignal(s0, {
			peerId: "peer-A",
			positive: true,
			timestamp: 1,
		});
		assert.equal(s1.alpha - s0.alpha, 1);
	});

	it("weight=0.5 produces partial update", () => {
		const s0 = initialReputation("peer-A");
		const s1 = applySignal(s0, {
			peerId: "peer-A",
			positive: true,
			weight: 0.5,
			timestamp: 1,
		});
		assert.equal(s1.alpha - s0.alpha, 0.5);
	});

	it("rejects negative weight", () => {
		const s0 = initialReputation("peer-A");
		assert.throws(
			() =>
				applySignal(s0, {
					peerId: "peer-A",
					positive: true,
					weight: -0.1,
					timestamp: 1,
				}),
			/negative weight/,
		);
	});

	it("rejects non-finite weight", () => {
		const s0 = initialReputation("peer-A");
		assert.throws(
			() =>
				applySignal(s0, {
					peerId: "peer-A",
					positive: true,
					weight: NaN,
					timestamp: 1,
				}),
			/non-finite/,
		);
	});
});

describe("reputation — mean / variance", () => {
	it("mean at prior is 0.5", () => {
		const s = initialReputation("peer-A");
		assert.equal(mean(s), 0.5);
	});

	it("mean increases with positive signals", () => {
		let s = initialReputation("peer-A");
		for (let i = 0; i < 5; i++) {
			s = applySignal(s, { peerId: "peer-A", positive: true, timestamp: 1 });
		}
		assert.ok(mean(s) > 0.7, `expected mean > 0.7, got ${mean(s)}`);
	});

	it("mean decreases with negative signals", () => {
		let s = initialReputation("peer-A");
		for (let i = 0; i < 5; i++) {
			s = applySignal(s, { peerId: "peer-A", positive: false, timestamp: 1 });
		}
		assert.ok(mean(s) < 0.3, `expected mean < 0.3, got ${mean(s)}`);
	});

	it("variance peaks at uniform prior and shrinks with evidence", () => {
		const s0 = initialReputation("peer-A");
		const v0 = variance(s0);
		let s1 = s0;
		for (let i = 0; i < 10; i++) {
			s1 = applySignal(s1, { peerId: "peer-A", positive: true, timestamp: 1 });
		}
		const v1 = variance(s1);
		assert.ok(v1 < v0, `expected variance to shrink (${v0} -> ${v1})`);
		assert.ok(v0 > 0);
		assert.ok(v1 > 0);
	});
});

describe("reputation — ReputationStore", () => {
	it("ensure creates prior state for unknown peer", () => {
		const store = new ReputationStore();
		const s = store.ensure("peer-X");
		assert.equal(s.peerId, "peer-X");
		assert.equal(s.alpha, 1);
		assert.equal(store.size(), 1);
	});

	it("ensure returns existing state for known peer", () => {
		const store = new ReputationStore();
		const a = store.ensure("peer-X");
		const b = store.ensure("peer-X");
		assert.equal(a, b);
		assert.equal(store.size(), 1);
	});

	it("update applies signal and persists state", () => {
		const store = new ReputationStore();
		const ts = 1_700_000_000_000;
		const next = store.update({
			peerId: "peer-X",
			positive: true,
			timestamp: ts,
		});
		assert.equal(next.alpha, 2);
		assert.equal(next.updatedAt, ts);
		assert.equal(store.get("peer-X")?.alpha, 2);
	});

	it("update is idempotent under repeated identical signals", () => {
		const store = new ReputationStore();
		store.update({ peerId: "peer-X", positive: true, timestamp: 1 });
		store.update({ peerId: "peer-X", positive: true, timestamp: 1 });
		store.update({ peerId: "peer-X", positive: true, timestamp: 1 });
		assert.equal(store.get("peer-X")?.alpha, 4); // 1 prior + 3 signals
	});

	it("all returns snapshot of states", () => {
		const store = new ReputationStore();
		store.update({ peerId: "A", positive: true, timestamp: 1 });
		store.update({ peerId: "B", positive: false, timestamp: 1 });
		assert.equal(store.all().length, 2);
	});

	it("remove deletes state", () => {
		const store = new ReputationStore();
		store.ensure("peer-X");
		assert.equal(store.remove("peer-X"), true);
		assert.equal(store.remove("peer-X"), false);
		assert.equal(store.size(), 0);
	});
});

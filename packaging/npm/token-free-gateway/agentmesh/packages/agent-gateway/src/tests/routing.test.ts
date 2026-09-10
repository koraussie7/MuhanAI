import { describe, expect, it } from "vitest";

import { type MachineRecord, SessionRouter } from "../routing.js";

const NOW = 1_700_000_000_000;

function machine(overrides: Partial<MachineRecord>): MachineRecord {
	return {
		userId: "u1",
		machineId: "m1",
		peerId: "peer-m1",
		platform: "macos",
		lastHeartbeatAt: NOW,
		reputationScore: 0.5,
		...overrides,
	};
}

describe("SessionRouter — liveness", () => {
	it("ignores machines whose heartbeat is older than 30s", () => {
		const r = new SessionRouter();
		r.upsert(machine({ machineId: "fresh", lastHeartbeatAt: NOW }));
		r.upsert(machine({ machineId: "stale", lastHeartbeatAt: NOW - 60_000 }));
		expect(r.onlineMachines("u1", NOW).map((m) => m.machineId)).toEqual(["fresh"]);
	});

	it("returns machines with reputationScore as the ranking key", () => {
		const r = new SessionRouter();
		r.upsert(machine({ machineId: "low", reputationScore: 0.2 }));
		r.upsert(machine({ machineId: "high", reputationScore: 0.9 }));
		const decision = r.route({
			sessionId: "s1",
			userId: "u1",
			now: NOW,
		});
		expect(decision?.machineId).toBe("high");
	});
});

describe("SessionRouter — sticky routing", () => {
	it("returns the same machineId for the same sessionId across calls", () => {
		const r = new SessionRouter();
		r.upsert(machine({ machineId: "a" }));
		r.upsert(machine({ machineId: "b", reputationScore: 0.9 }));
		const first = r.route({ sessionId: "s", userId: "u1", now: NOW });
		expect(first?.machineId).toBe("b");
		// second call should still pick b even though both machines are live
		const second = r.route({ sessionId: "s", userId: "u1", now: NOW + 1000 });
		expect(second?.machineId).toBe("b");
	});

	it("forgetSession() clears stickiness so next call can re-pick", () => {
		const r = new SessionRouter();
		r.upsert(machine({ machineId: "a" }));
		r.upsert(machine({ machineId: "b", reputationScore: 0.9 }));
		r.route({ sessionId: "s", userId: "u1", now: NOW });
		r.forgetSession("s");
		r.upsert(machine({ machineId: "a", reputationScore: 0.99 }));
		const next = r.route({ sessionId: "s", userId: "u1", now: NOW });
		expect(next?.machineId).toBe("a");
	});
});

describe("SessionRouter — fallback", () => {
	it("returns null when no machines are online", () => {
		const r = new SessionRouter();
		expect(r.route({ sessionId: "s", userId: "ghost", now: NOW })).toBeNull();
	});

	it("honors preferredMachineId when it is online", () => {
		const r = new SessionRouter();
		r.upsert(machine({ machineId: "a" }));
		r.upsert(machine({ machineId: "b", reputationScore: 0.99 }));
		const d = r.route({
			sessionId: "s",
			userId: "u1",
			preferredMachineId: "a",
			now: NOW,
		});
		expect(d?.machineId).toBe("a");
	});
});

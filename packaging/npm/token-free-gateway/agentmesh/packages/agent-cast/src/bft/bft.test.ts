import { describe, expect, it } from "vitest";
import {
	BftOverlay,
	ByzantineDetector,
	canonicalEncode,
	HmacKeyring,
	hashPayload,
	hasQuorum,
	quorumFor,
	type SignedProposal,
	signProposal,
	staticProvider,
	type UnsignedProposal,
	VoteTally,
	verifyProposal,
} from "./index.js";

function makeKeyring(ids: string[]): HmacKeyring {
	const seed: Record<string, Uint8Array> = {};
	// Add a random salt so different keyrings (even with same ids) hold
	// different secrets — needed to test "wrong key fails verify".
	const salt = Math.floor(Math.random() * 0x100000000);
	for (const id of ids) {
		const buf = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			buf[i] = ((id.charCodeAt(i % id.length) ^ i) + salt) & 0xff;
		}
		seed[id] = buf;
	}
	return new HmacKeyring(seed);
}

describe("quorumFor", () => {
	it("computes f=0 quorum=1 for n=1", () => {
		const q = quorumFor(1);
		expect(q).toEqual({ n: 1, f: 0, quorum: 1, weakQuorum: 1 });
	});

	it("computes f=1 quorum=3 for n=4", () => {
		const q = quorumFor(4);
		expect(q).toEqual({ n: 4, f: 1, quorum: 3, weakQuorum: 2 });
	});

	it("computes f=2 quorum=5 for n=7", () => {
		const q = quorumFor(7);
		expect(q).toEqual({ n: 7, f: 2, quorum: 5, weakQuorum: 3 });
	});

	it("computes f=3 quorum=7 for n=10", () => {
		const q = quorumFor(10);
		expect(q).toEqual({ n: 10, f: 3, quorum: 7, weakQuorum: 4 });
	});

	it("rejects non-positive integers", () => {
		expect(() => quorumFor(0)).toThrow();
		expect(() => quorumFor(-3)).toThrow();
		expect(() => quorumFor(2.5)).toThrow();
	});

	it("hasQuorum compares against the spec", () => {
		const spec = quorumFor(7);
		expect(hasQuorum(5, spec)).toBe(true);
		expect(hasQuorum(4, spec)).toBe(false);
	});
});

describe("proposal signing", () => {
	it("round-trips sign/verify on a canonical encoding", () => {
		const keyring = makeKeyring(["a"]);
		const signer = keyring.signer("a");
		const unsigned: UnsignedProposal = {
			view: 0,
			seq: 0,
			proposerId: "a",
			payloadHash: hashPayload("hello"),
		};
		const signed = signProposal(unsigned, signer);
		expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
		expect(verifyProposal(signed, signer)).toBe(true);
	});

	it("fails verification when signed by a different keyring", () => {
		const k1 = makeKeyring(["a"]);
		const k2 = makeKeyring(["a"]);
		const signed = signProposal(
			{ view: 0, seq: 0, proposerId: "a", payloadHash: hashPayload("x") },
			k1.signer("a"),
		);
		expect(verifyProposal(signed, k2.signer("a"))).toBe(false);
	});

	it("canonical encoding is deterministic", () => {
		const a = canonicalEncode({ view: 1, seq: 2, proposerId: "p", payloadHash: "h" });
		const b = canonicalEncode({ view: 1, seq: 2, proposerId: "p", payloadHash: "h" });
		expect(a).toEqual(b);
	});

	it("rejects signProposal with mismatched signer.id", () => {
		const keyring = makeKeyring(["a", "b"]);
		expect(() =>
			signProposal(
				{ view: 0, seq: 0, proposerId: "a", payloadHash: hashPayload("x") },
				keyring.signer("b"),
			),
		).toThrow(/signer.id/);
	});
});

describe("ByzantineDetector — equivocation", () => {
	it("returns false on first observation, true on conflicting second", () => {
		const d = new ByzantineDetector();
		const p1: SignedProposal = {
			view: 0,
			seq: 0,
			proposerId: "x",
			payloadHash: hashPayload("alpha"),
			signature: "sig1",
		};
		const p2: SignedProposal = { ...p1, payloadHash: hashPayload("beta"), signature: "sig2" };
		expect(d.observe(p1)).toBe(false);
		expect(d.observe(p2)).toBe(true);
		const report = d.report();
		expect(report.agents.has("x")).toBe(true);
		expect(report.reasons[0]?.kind).toBe("equivocation");
	});

	it("treats identical re-broadcasts as benign", () => {
		const d = new ByzantineDetector();
		const p: SignedProposal = {
			view: 0,
			seq: 0,
			proposerId: "x",
			payloadHash: hashPayload("alpha"),
			signature: "sig1",
		};
		expect(d.observe(p)).toBe(false);
		expect(d.observe(p)).toBe(false);
		expect(d.report().agents.size).toBe(0);
	});

	it("tracks timeouts and de-dupes by (agent, phase)", () => {
		const d = new ByzantineDetector();
		d.reportTimeout("a", "prepare");
		d.reportTimeout("a", "prepare");
		d.reportTimeout("a", "commit");
		d.reportTimeout("b", "prepare");
		const report = d.report();
		expect(report.agents.size).toBe(2);
		expect(report.reasons.filter((r) => r.kind === "timeout")).toHaveLength(3);
	});
});

describe("VoteTally", () => {
	it("picks the payload with the most distinct voters", () => {
		const t = new VoteTally();
		const h1 = hashPayload("a");
		const h2 = hashPayload("b");
		const mk = (h: string, voter: string): SignedProposal => ({
			view: 0,
			seq: 0,
			proposerId: voter,
			payloadHash: h,
			signature: "s",
		});
		t.add(mk(h1, "v1"), "v1");
		t.add(mk(h1, "v2"), "v2");
		t.add(mk(h1, "v3"), "v3");
		t.add(mk(h2, "v4"), "v4");
		const leader = t.leader();
		expect(leader?.payloadHash).toBe(h1);
		expect(leader?.votes).toBe(3);
	});

	it("ignores double-votes from the same voter", () => {
		const t = new VoteTally();
		const h1 = hashPayload("a");
		const h2 = hashPayload("b");
		const mk = (h: string, voter: string): SignedProposal => ({
			view: 0,
			seq: 0,
			proposerId: voter,
			payloadHash: h,
			signature: "s",
		});
		// Same voter adds two different payloads — only counts once toward the leader.
		t.add(mk(h1, "v1"), "v1");
		t.add(mk(h2, "v1"), "v1");
		const leader = t.leader();
		expect(leader?.votes).toBe(1);
	});
});

describe("BftOverlay — happy path", () => {
	it("commits when all 7 honest agents converge on the same answer", async () => {
		const ids = Array.from({ length: 7 }, (_, i) => `agent-${i}`);
		const keyring = makeKeyring(ids);
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: staticProvider({
				...Object.fromEntries(ids.map((id) => [id, "consensus-answer"])),
			}),
		});
		const outcome = await overlay.runConsensus("Q?");
		expect(outcome.committed).toBe(true);
		expect(outcome.committedPayload).toBe("consensus-answer");
		expect(outcome.byzantine).toHaveLength(0);
		expect(outcome.spec.f).toBe(2);
		expect(outcome.spec.quorum).toBe(5);
	});

	it("tolerates f Byzantine agents with honest majority", async () => {
		const ids = Array.from({ length: 7 }, (_, i) => `agent-${i}`);
		const keyring = makeKeyring(ids);
		// Agents 0 and 1 give wrong answers; the rest agree on the canonical one.
		const answers: Record<string, string> = {};
		for (const id of ids) answers[id] = id === "agent-0" || id === "agent-1" ? "wrong" : "right";
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: staticProvider(answers),
		});
		const outcome = await overlay.runConsensus("Q?");
		expect(outcome.committed).toBe(true);
		expect(outcome.committedPayload).toBe("right");
		// No equivocation evidence: the malicious agents just voted for a different value.
		expect(outcome.byzantine.filter((r) => r.kind === "equivocation")).toHaveLength(0);
	});

	it("rejects duplicate participant ids", () => {
		const keyring = makeKeyring(["a", "b"]);
		expect(
			() =>
				new BftOverlay({
					participants: ["a", "a"],
					keyring,
					provider: staticProvider({ a: "x", b: "y" }),
				}),
		).toThrow(/unique/);
	});
});

describe("BftOverlay — Byzantine detection", () => {
	it("flags equivocation when one agent produces two conflicting proposals", async () => {
		const ids = ["a", "b", "c", "d"];
		const keyring = makeKeyring(ids);
		// Simulate equivocation directly via the detector (the public BFT
		// consensus loop only calls each participant once per round, so
		// observable equivocation would require a multi-round scenario —
		// covered at the detector level here).
		const detector = new ByzantineDetector();
		const signer = keyring.signer("a");
		const p1 = signProposal(
			{ view: 0, seq: 0, proposerId: "a", payloadHash: hashPayload("alpha") },
			signer,
		);
		const p2 = signProposal(
			{ view: 0, seq: 0, proposerId: "a", payloadHash: hashPayload("beta") },
			signer,
		);
		expect(detector.observe(p1)).toBe(false);
		expect(detector.observe(p2)).toBe(true);
		const report = detector.report();
		expect(report.agents.has("a")).toBe(true);
		expect(report.reasons[0]?.kind).toBe("equivocation");
		// Sanity: BftOverlay wiring is sound even when no equivocation happens.
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: staticProvider({ ...Object.fromEntries(ids.map((id) => [id, "stable"])) }),
		});
		const outcome = await overlay.runConsensus("Q?");
		expect(outcome.committed).toBe(true);
		expect(outcome.byzantine).toHaveLength(0);
	});

	it("falls back to prepare-leader when commit quorum cannot form", async () => {
		const ids = Array.from({ length: 4 }, (_, i) => `agent-${i}`);
		const keyring = makeKeyring(ids);
		// n=4 → f=1, quorum=3. Make 2 participants throw so only 2 votes
		// are ever cast — below quorum, consensus cannot commit.
		const answers: Record<string, string> = {
			"agent-0": "x",
			"agent-1": "y",
			"agent-2": "z",
			"agent-3": "x",
		};
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: {
				async produce(agentId, _q) {
					if (agentId === "agent-2" || agentId === "agent-3") {
						throw new Error("simulated failure");
					}
					return answers[agentId]!;
				},
			},
		});
		const outcome = await overlay.runConsensus("Q?");
		expect(outcome.committed).toBe(false);
		expect(outcome.prepareLeader).not.toBeNull();
		// 2 silent failures → 2 Byzantine timeout records.
		expect(outcome.byzantine.filter((r) => r.kind === "timeout")).toHaveLength(2);
	});
});

describe("BftOverlay — castAsResult shape", () => {
	it("produces a BftCastResult extending CastResult", async () => {
		const ids = Array.from({ length: 4 }, (_, i) => `agent-${i}`);
		const keyring = makeKeyring(ids);
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: staticProvider({ ...Object.fromEntries(ids.map((id) => [id, "same"])) }),
		});
		const result = await overlay.castAsResult("Q?");
		expect(result.committed).toBe(true);
		expect(result.consensusScore).toBe(1);
		expect(result.finalAnswer).toBe("same");
		expect(result.selectedAgents).toHaveLength(4);
		expect(result.prepareQuorum).toBe(3);
		expect(result.commitQuorum).toBe(3);
		expect(result.byzantine).toEqual([]);
		expect(result.view).toBe(0);
		expect(result.seq).toBe(0);
	});

	it("reports consensusScore < 1 when not committed", async () => {
		const ids = ["a", "b", "c"];
		const keyring = makeKeyring(ids);
		const overlay = new BftOverlay({
			participants: ids,
			keyring,
			provider: {
				async produce(agentId, _q) {
					// 2 of 3 fail — quorum (3 for n=3? actually f=0, quorum=1)
					// is unreachable when zero honest votes are cast? No — n=3 →
					// f=0, quorum=1. We need a stronger setup. Use n=7 with
					// 6 failing providers.
					throw new Error("nope");
				},
			},
		});
		const result = await overlay.castAsResult("Q?");
		expect(result.committed).toBe(false);
		expect(result.consensusScore).toBe(0);
		expect(result.finalAnswer).toMatch(/No consensus/);
	});
});

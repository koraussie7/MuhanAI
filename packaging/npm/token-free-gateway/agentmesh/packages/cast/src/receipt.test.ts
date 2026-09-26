import { describe, expect, it } from "vitest";
import {
	canonicalReceiptBytes,
	canonicalReceiptId,
	ReceiptLedger,
	verifyReceiptStructure,
	type CallReceipt,
} from "./receipt.js";

function makeReceipt(overrides: Partial<CallReceipt> = {}): CallReceipt {
	return {
		id: "r-1",
		callerPeerId: "peer-A",
		calleePeerId: "peer-B",
		modelId: "qwen-q4",
		promptTokens: 100,
		completionTokens: 50,
		latencyMs: 200,
		timestamp: Date.now(),
		signatures: { caller: "sig-A" },
		...overrides,
	};
}

describe("verifyReceiptStructure", () => {
	it("accepts a well-formed receipt", () => {
		const r = verifyReceiptStructure({ receipt: makeReceipt() });
		expect(r.ok).toBe(true);
	});

	it("rejects receipts without a caller signature", () => {
		const r = verifyReceiptStructure({ receipt: makeReceipt({ signatures: {} }) });
		expect(r.ok).toBe(false);
		expect(r.reason).toBe("missing caller signature");
	});

	it("rejects negative latency or token counts", () => {
		expect(verifyReceiptStructure({ receipt: makeReceipt({ latencyMs: -1 }) }).ok).toBe(false);
		expect(verifyReceiptStructure({ receipt: makeReceipt({ promptTokens: -1 }) }).ok).toBe(false);
	});

	it("rejects old receipts", () => {
		const r = verifyReceiptStructure({
			receipt: makeReceipt({ timestamp: Date.now() - 25 * 60 * 60 * 1000 }),
			now: Date.now,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toBe("receipt too old");
	});
});

describe("canonicalReceiptBytes", () => {
	it("strips signatures before hashing", () => {
		const r1 = makeReceipt();
		const r2 = { ...r1, signatures: { caller: "different", callee: "callee" } };
		expect(canonicalReceiptBytes(r1)).toEqual(canonicalReceiptBytes(r2));
	});

	it("canonicalReceiptId is stable for the same body", () => {
		const r1 = makeReceipt({ timestamp: 1_700_000_000 });
		const r2 = makeReceipt({ timestamp: 1_700_000_000 });
		expect(canonicalReceiptId(r1)).toBe(canonicalReceiptId(r2));
	});

	it("accepts a custom hash function for cross-platform tests", () => {
		const r = makeReceipt();
		const fakeHash = "a".repeat(64);
		const id = canonicalReceiptId(r, { hash: () => fakeHash });
		expect(id).toMatch(/^(blake3|sha256):[a-f0-9]{64}$/);
	});
});

describe("ReceiptLedger", () => {
	it("appends and queries by peer", () => {
		const ledger = new ReceiptLedger();
		ledger.append(makeReceipt({ id: "r-1" }), 100);
		ledger.append(makeReceipt({ id: "r-2", calleePeerId: "peer-C" }), 200);
		expect(ledger.byPeer("peer-A")).toHaveLength(2);
		expect(ledger.byPeer("peer-C")).toHaveLength(1);
		expect(ledger.size()).toBe(2);
	});

	it("trims to maxEntries", () => {
		const ledger = new ReceiptLedger({ maxEntries: 2 });
		ledger.append(makeReceipt({ id: "r-1" }), 1);
		ledger.append(makeReceipt({ id: "r-2" }), 2);
		ledger.append(makeReceipt({ id: "r-3" }), 3);
		expect(ledger.size()).toBe(2);
		expect(ledger.all()[0]?.receipt.id).toBe("r-2");
	});
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	type CoReceipt,
	CoReceiptLedger,
	NEWCOMER_GRACE_TOKENS,
	type Signer,
	signReceipt,
} from "./co-receipt.js";

function makeReceipt(overrides: Partial<CoReceipt> = {}): CoReceipt {
	return {
		id: overrides.id ?? "r-1",
		payerPeerId: overrides.payerPeerId ?? "payer-A",
		payeePeerId: overrides.payeePeerId ?? "payee-B",
		resourceUnits: overrides.resourceUnits ?? 10,
		agreedRatio: overrides.agreedRatio ?? 1.0,
		timestamp: overrides.timestamp ?? 1,
		payerSignature: overrides.payerSignature ?? "sig",
	};
}

const stubSigner: Signer = {
	sign: async (data: Uint8Array) => {
		const out = new Uint8Array(64);
		for (let i = 0; i < data.length && i < 64; i++) out[i] = data[i] ?? 0;
		return out;
	},
};

describe("co-receipt — signReceipt", () => {
	it("produces base64 signature over canonical encoding", async () => {
		const sig = await signReceipt(stubSigner, "receipt-1", 42);
		assert.equal(typeof sig, "string");
		const decoded = Buffer.from(sig, "base64");
		assert.equal(decoded.length, 64);
	});

	it("is deterministic for the same signer input", async () => {
		const a = await signReceipt(stubSigner, "r", 10);
		const b = await signReceipt(stubSigner, "r", 10);
		assert.equal(a, b);
	});

	it("differs for different receipt ids", async () => {
		const a = await signReceipt(stubSigner, "r1", 10);
		const b = await signReceipt(stubSigner, "r2", 10);
		assert.notEqual(a, b);
	});
});

describe("co-receipt — CoReceiptLedger.append + ratio", () => {
	it("ratio is 0 for unknown peer", () => {
		const ledger = new CoReceiptLedger();
		assert.equal(ledger.ratio("ghost"), 0);
	});

	it("ratio = provided / consumed when payer has consumed and provided", () => {
		const ledger = new CoReceiptLedger();
		// payer-A consumes 10 from payee-B
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "payer-A",
				payeePeerId: "payee-B",
				resourceUnits: 10,
			}),
		);
		// payer-A provides 5 to some peer (payee of that receipt = payer-A)
		ledger.append(
			makeReceipt({
				id: "p1",
				payerPeerId: "peer-X",
				payeePeerId: "payer-A",
				resourceUnits: 5,
			}),
		);
		assert.equal(ledger.ratio("payer-A"), 5 / 10);
	});

	it("ratio is 0 when payer has only consumed (no provider role yet)", () => {
		const ledger = new CoReceiptLedger();
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "payer-A",
				payeePeerId: "payee-B",
				resourceUnits: 10,
			}),
		);
		assert.equal(ledger.ratio("payer-A"), 0);
	});

	it("aggregates across many receipts for the same payer", () => {
		const ledger = new CoReceiptLedger();
		for (let i = 0; i < 3; i++) {
			ledger.append(
				makeReceipt({
					id: `c${i}`,
					payerPeerId: "payer-A",
					payeePeerId: "payee-B",
					resourceUnits: 10,
				}),
			);
		}
		for (let i = 0; i < 3; i++) {
			ledger.append(
				makeReceipt({
					id: `p${i}`,
					payerPeerId: "peer-X",
					payeePeerId: "payer-A",
					resourceUnits: 20,
				}),
			);
		}
		assert.equal(ledger.ratio("payer-A"), 60 / 30);
	});
});

describe("co-receipt — consumeGrace", () => {
	it("succeeds up to NEWCOMER_GRACE_TOKENS, fails beyond", () => {
		const ledger = new CoReceiptLedger();
		assert.equal(ledger.consumeGrace("newcomer", NEWCOMER_GRACE_TOKENS), true);
		assert.equal(ledger.consumeGrace("newcomer", 1), false);
	});

	it("decrements across multiple calls", () => {
		const ledger = new CoReceiptLedger();
		ledger.consumeGrace("p", 30);
		ledger.consumeGrace("p", 50);
		assert.equal(ledger.graceRemaining("p"), NEWCOMER_GRACE_TOKENS - 80);
	});

	it("rejects negative tokens", () => {
		const ledger = new CoReceiptLedger();
		assert.throws(() => ledger.consumeGrace("p", -1), /non-negative/);
	});

	it("rejects non-integer tokens", () => {
		const ledger = new CoReceiptLedger();
		assert.throws(() => ledger.consumeGrace("p", 1.5), /non-negative/);
	});

	it("default grace remaining is NEWCOMER_GRACE_TOKENS for unknown peer", () => {
		const ledger = new CoReceiptLedger();
		assert.equal(ledger.graceRemaining("ghost"), NEWCOMER_GRACE_TOKENS);
	});
});

describe("co-receipt — shouldPay hysteresis", () => {
	it("starts in pay mode for unknown peer", () => {
		const ledger = new CoReceiptLedger();
		assert.equal(ledger.modeOf("ghost"), "pay");
		assert.equal(ledger.shouldPay("ghost"), true);
	});

	it("does not flip from pay → drain within HYSTERESIS_BAND", () => {
		const ledger = new CoReceiptLedger();
		// ratio 1.0 - 0.03 = 0.97, threshold 1.0, band 0.05 → 0.97 > 0.95 → stays pay
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "p",
				payeePeerId: "x",
				resourceUnits: 100,
			}),
		);
		ledger.append(
			makeReceipt({
				id: "p1",
				payerPeerId: "y",
				payeePeerId: "p",
				resourceUnits: 97,
			}),
		);
		// ratio ≈ 0.97, threshold 1.0 - HYSTERESIS_BAND = 0.95 → 0.97 > 0.95 → pay
		assert.equal(ledger.shouldPay("p", 1.0), true);
		assert.equal(ledger.modeOf("p"), "pay");
	});

	it("flips from pay → drain when ratio drops below threshold - band", () => {
		const ledger = new CoReceiptLedger();
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "p",
				payeePeerId: "x",
				resourceUnits: 100,
			}),
		);
		ledger.append(
			makeReceipt({
				id: "p1",
				payerPeerId: "y",
				payeePeerId: "p",
				resourceUnits: 50,
			}),
		);
		// ratio = 50/100 = 0.5, threshold 1.0 - 0.05 = 0.95 → 0.5 < 0.95 → drain
		assert.equal(ledger.shouldPay("p", 1.0), false);
		assert.equal(ledger.modeOf("p"), "drain");
	});

	it("flips from drain → pay when ratio exceeds threshold + band", () => {
		const ledger = new CoReceiptLedger();
		// First, push into drain mode
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "p",
				payeePeerId: "x",
				resourceUnits: 100,
			}),
		);
		ledger.shouldPay("p", 1.0); // ratio 0 → drain
		assert.equal(ledger.modeOf("p"), "drain");

		// Now provide a lot so ratio goes well above 1.0
		ledger.append(
			makeReceipt({
				id: "p1",
				payerPeerId: "y",
				payeePeerId: "p",
				resourceUnits: 200,
			}),
		);
		// ratio = 200/100 = 2.0, threshold 1.0 + 0.05 = 1.05 → 2.0 > 1.05 → pay
		assert.equal(ledger.shouldPay("p", 1.0), true);
		assert.equal(ledger.modeOf("p"), "pay");
	});

	it("does not flip from drain → pay within HYSTERESIS_BAND", () => {
		const ledger = new CoReceiptLedger();
		ledger.append(
			makeReceipt({
				id: "c1",
				payerPeerId: "p",
				payeePeerId: "x",
				resourceUnits: 100,
			}),
		);
		ledger.shouldPay("p", 1.0); // ratio 0 → drain
		assert.equal(ledger.modeOf("p"), "drain");

		ledger.append(
			makeReceipt({
				id: "p1",
				payerPeerId: "y",
				payeePeerId: "p",
				resourceUnits: 102,
			}),
		);
		// ratio = 102/100 = 1.02, threshold 1.0 + 0.05 = 1.05 → 1.02 < 1.05 → stays drain
		assert.equal(ledger.shouldPay("p", 1.0), false);
		assert.equal(ledger.modeOf("p"), "drain");
	});
});

describe("co-receipt — size / get / all", () => {
	it("size tracks appended receipts", () => {
		const ledger = new CoReceiptLedger();
		assert.equal(ledger.size(), 0);
		ledger.append(makeReceipt({ id: "a" }));
		ledger.append(makeReceipt({ id: "b" }));
		assert.equal(ledger.size(), 2);
	});

	it("get returns receipt by id", () => {
		const ledger = new CoReceiptLedger();
		ledger.append(makeReceipt({ id: "a", payerSignature: "sig-a" }));
		assert.equal(ledger.get("a")?.payerSignature, "sig-a");
		assert.equal(ledger.get("missing"), undefined);
	});

	it("all returns snapshot", () => {
		const ledger = new CoReceiptLedger();
		ledger.append(makeReceipt({ id: "a" }));
		ledger.append(makeReceipt({ id: "b" }));
		assert.equal(ledger.all().length, 2);
	});
});

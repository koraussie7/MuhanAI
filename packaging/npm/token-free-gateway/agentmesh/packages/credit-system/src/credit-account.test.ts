import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	applyCarryOver,
	BASE_ALLOCATION,
	CARRY_OVER_PCT,
	type CreditAccount,
	CreditAccountBook,
	monthlyCreditFor,
	REPUTATION_THRESHOLDS,
	tierForReputation,
} from "./credit-account.js";

describe("credit-account — tierForReputation", () => {
	it("maps 0.19 → free", () => {
		assert.equal(tierForReputation(0.19), "free");
	});

	it("maps 0.2 exactly → contributor (boundary inclusive)", () => {
		assert.equal(tierForReputation(REPUTATION_THRESHOLDS.contributor), "contributor");
	});

	it("maps 0.5 exactly → power (boundary inclusive)", () => {
		assert.equal(tierForReputation(REPUTATION_THRESHOLDS.power), "power");
	});

	it("maps 0.8 exactly → unlimited (boundary inclusive)", () => {
		assert.equal(tierForReputation(REPUTATION_THRESHOLDS.unlimited), "unlimited");
	});

	it("maps 1.0 → unlimited", () => {
		assert.equal(tierForReputation(1.0), "unlimited");
	});

	it("rejects out-of-range reputation", () => {
		assert.throws(() => tierForReputation(-0.1), /\[0, 1\]/);
		assert.throws(() => tierForReputation(1.5), /\[0, 1\]/);
	});

	it("rejects non-finite reputation", () => {
		assert.throws(() => tierForReputation(NaN), /finite/);
		assert.throws(() => tierForReputation(Infinity), /finite/);
	});
});

describe("credit-account — monthlyCreditFor", () => {
	it("reputation=0 → only baseAllocation", () => {
		const account: CreditAccount = {
			peerId: "p",
			tier: "free",
			monthlyRewards: 1000,
			baseAllocation: BASE_ALLOCATION,
			carryOverPct: CARRY_OVER_PCT,
			balance: 0,
			reputation: 0,
		};
		assert.equal(monthlyCreditFor(account), BASE_ALLOCATION);
	});

	it("reputation=1 → baseAllocation + monthlyRewards", () => {
		const account: CreditAccount = {
			peerId: "p",
			tier: "unlimited",
			monthlyRewards: 1000,
			baseAllocation: BASE_ALLOCATION,
			carryOverPct: CARRY_OVER_PCT,
			balance: 0,
			reputation: 1,
		};
		assert.equal(monthlyCreditFor(account), BASE_ALLOCATION + 1000);
	});

	it("reputation=0.5 floors fractional bonus", () => {
		const account: CreditAccount = {
			peerId: "p",
			tier: "power",
			monthlyRewards: 1000,
			baseAllocation: BASE_ALLOCATION,
			carryOverPct: CARRY_OVER_PCT,
			balance: 0,
			reputation: 0.5,
		};
		assert.equal(monthlyCreditFor(account), BASE_ALLOCATION + 500);
	});

	it("reputation=0.3 fractional bonus floor", () => {
		const account: CreditAccount = {
			peerId: "p",
			tier: "contributor",
			monthlyRewards: 1000,
			baseAllocation: BASE_ALLOCATION,
			carryOverPct: CARRY_OVER_PCT,
			balance: 0,
			reputation: 0.3,
		};
		assert.equal(monthlyCreditFor(account), BASE_ALLOCATION + 300);
	});
});

describe("credit-account — applyCarryOver", () => {
	it("100 prev → 50 carry + base", () => {
		assert.equal(applyCarryOver(100), Math.floor(100 * CARRY_OVER_PCT) + BASE_ALLOCATION);
	});

	it("0 prev → 0 + base", () => {
		assert.equal(applyCarryOver(0), BASE_ALLOCATION);
	});

	it("rejects negative prev balance", () => {
		assert.throws(() => applyCarryOver(-1), /non-negative/);
	});

	it("respects custom baseAllocation", () => {
		assert.equal(applyCarryOver(0, 250), 250);
	});
});

describe("credit-account — CreditAccountBook", () => {
	it("upsert creates account with derived tier", () => {
		const book = new CreditAccountBook();
		const account = book.upsert("peer-A", 0.6, 1000);
		assert.equal(account.peerId, "peer-A");
		assert.equal(account.tier, "power");
		assert.equal(account.reputation, 0.6);
		assert.equal(account.monthlyRewards, 1000);
		assert.equal(account.baseAllocation, BASE_ALLOCATION);
		assert.equal(book.size(), 1);
	});

	it("upsert recomputes tier on reputation change", () => {
		const book = new CreditAccountBook();
		const low = book.upsert("peer-A", 0.1);
		assert.equal(low.tier, "free");
		const high = book.upsert("peer-A", 0.9);
		assert.equal(high.tier, "unlimited");
		assert.equal(book.size(), 1);
	});

	it("tierOf returns undefined for unknown peer", () => {
		const book = new CreditAccountBook();
		assert.equal(book.tierOf("ghost"), undefined);
	});

	it("tierOf returns tier after upsert", () => {
		const book = new CreditAccountBook();
		book.upsert("peer-A", 0.55);
		assert.equal(book.tierOf("peer-A"), "power");
	});

	it("all returns snapshot of accounts", () => {
		const book = new CreditAccountBook();
		book.upsert("A", 0.1);
		book.upsert("B", 0.3);
		book.upsert("C", 0.9);
		assert.equal(book.all().length, 3);
	});

	it("remove deletes account", () => {
		const book = new CreditAccountBook();
		book.upsert("peer-X", 0.5);
		assert.equal(book.remove("peer-X"), true);
		assert.equal(book.remove("peer-X"), false);
		assert.equal(book.size(), 0);
	});
});

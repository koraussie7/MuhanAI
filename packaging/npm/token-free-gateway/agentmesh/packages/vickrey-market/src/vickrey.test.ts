import { describe, expect, it } from "vitest";
import {
	AuctionError,
	type AuctionListing,
	CommitmentError,
	commitTo,
	createBidCommitment,
	generateNonce,
	VickreyAuction,
	VickreyMarketplace,
	verifyReveal,
} from "./index.js";

/** Build an open auction whose deadlines are entirely in the future. */
function openListing(
	overrides: Partial<AuctionListing> = {},
	now: number = 1_000_000,
): AuctionListing {
	return {
		id: "L1",
		sellerId: "seller",
		title: "GPU Hour",
		reservePrice: 100,
		commitDeadline: now + 1_000,
		revealDeadline: now + 2_000,
		createdAt: now,
		...overrides,
	};
}

/** Mutable clock helper — returns `now()` and lets tests bump it. */
function makeClock(start: number = 1_000_000) {
	let t = start;
	return {
		now: () => t,
		bump: (ms: number) => {
			t += ms;
		},
		set: (v: number) => {
			t = v;
		},
	};
}

describe("commitment", () => {
	it("createBidCommitment produces a 64-char hex hash", () => {
		const c = createBidCommitment(500);
		expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(c.nonce).toMatch(/^[0-9a-f]{64}$/);
		expect(c.amount).toBe(500);
	});

	it("is deterministic for the same (amount, nonce)", () => {
		const nonce = generateNonce();
		const a = createBidCommitment(100, nonce);
		const b = createBidCommitment(100, nonce);
		expect(a.hash).toBe(b.hash);
	});

	it("changes hash when amount changes (same nonce)", () => {
		const nonce = generateNonce();
		const a = createBidCommitment(100, nonce);
		const b = createBidCommitment(101, nonce);
		expect(a.hash).not.toBe(b.hash);
	});

	it("verifyReveal returns true for correct reveal, false otherwise", () => {
		const c = createBidCommitment(250);
		expect(verifyReveal(c.hash, 250, c.nonce)).toBe(true);
		expect(verifyReveal(c.hash, 251, c.nonce)).toBe(false);
		expect(verifyReveal(c.hash, 250, generateNonce())).toBe(false);
	});

	it("commitTo is callable directly with the same output", () => {
		const nonce = generateNonce();
		const direct = commitTo(42, nonce);
		const fromBuilder = createBidCommitment(42, nonce).hash;
		expect(direct).toBe(fromBuilder);
	});

	it("rejects negative amounts", () => {
		expect(() => createBidCommitment(-1)).toThrow(CommitmentError);
	});

	it("rejects non-integer amounts", () => {
		expect(() => createBidCommitment(1.5)).toThrow(CommitmentError);
	});

	it("rejects non-hex nonces", () => {
		expect(() => createBidCommitment(100, "not-hex!")).toThrow(CommitmentError);
	});

	it("generateNonce returns unique values across calls", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 50; i++) seen.add(generateNonce());
		expect(seen.size).toBe(50);
	});
});

describe("VickreyAuction — happy path", () => {
	it("winner pays the second-highest bid", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);

		// Three bidders with decreasing bids.
		const a = createBidCommitment(500);
		const b = createBidCommitment(400);
		const c = createBidCommitment(300);
		auction.commit("alice", a, t);
		auction.commit("bob", b, t);
		auction.commit("carol", c, t);
		clock.bump(1_000); // past commitDeadline
		const r = clock.now();
		auction.reveal("alice", 500, a.nonce, r);
		auction.reveal("bob", 400, b.nonce, r);
		auction.reveal("carol", 300, c.nonce, r);
		clock.bump(1_000); // past revealDeadline
		const result = auction.settle(clock.now());

		expect(result.phase).toBe("settled");
		expect(result.winnerId).toBe("alice");
		expect(result.winningBid).toBe(500);
		expect(result.clearingPrice).toBe(400); // alice pays bob's bid
		expect(result.revealsAccepted).toBe(3);
	});

	it("single bid → clearing price is the reserve (or the bid)", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({ reservePrice: 100 }, t), t);
		const c = createBidCommitment(150);
		auction.commit("alice", c, t);
		clock.bump(1_000);
		const r = clock.now();
		auction.reveal("alice", 150, c.nonce, r);
		clock.bump(1_000);
		const result = auction.settle(clock.now());

		expect(result.winnerId).toBe("alice");
		expect(result.winningBid).toBe(150);
		expect(result.clearingPrice).toBe(100); // floor at reserve
	});

	it("all bids below reserve → no sale", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({ reservePrice: 1_000 }, t), t);
		const a = createBidCommitment(500);
		const b = createBidCommitment(700);
		auction.commit("alice", a, t);
		auction.commit("bob", b, t);
		clock.bump(1_000);
		const r = clock.now();
		auction.reveal("alice", 500, a.nonce, r);
		auction.reveal("bob", 700, b.nonce, r);
		clock.bump(1_000);
		const result = auction.settle(clock.now());

		expect(result.winnerId).toBeNull();
		expect(result.winningBid).toBeNull();
		expect(result.clearingPrice).toBeNull();
	});

	it("no commitments → no winner, empty reveals", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		clock.bump(2_000);
		const result = auction.settle(clock.now());

		expect(result.winnerId).toBeNull();
		expect(result.revealsAccepted).toBe(0);
		expect(result.participants).toEqual([]);
	});
});

describe("VickreyAuction — integrity", () => {
	it("rejects a reveal whose nonce does not match the commitment", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const c = createBidCommitment(500);
		auction.commit("alice", c, t);
		clock.bump(1_000);
		expect(() => auction.reveal("alice", 500, generateNonce(), clock.now())).toThrow(AuctionError);
	});

	it("rejects a reveal with mismatched amount", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const c = createBidCommitment(500);
		auction.commit("alice", c, t);
		clock.bump(1_000);
		expect(() => auction.reveal("alice", 600, c.nonce, clock.now())).toThrow(/does not match/);
	});

	it("rejects a reveal from a bidder who never committed", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		clock.bump(1_000);
		expect(() => auction.reveal("ghost", 100, generateNonce(), clock.now())).toThrow(
			/no commitment/,
		);
	});

	it("rejects a reveal from the same bidder twice", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const c = createBidCommitment(500);
		auction.commit("alice", c, t);
		clock.bump(1_000);
		auction.reveal("alice", 500, c.nonce, clock.now());
		expect(() => auction.reveal("alice", 500, c.nonce, clock.now())).toThrow(/already revealed/);
	});

	it("rejects late commit (after commitDeadline)", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		clock.bump(2_000);
		expect(() => auction.commit("alice", createBidCommitment(100), clock.now())).toThrow(
			/deadline/,
		);
	});

	it("rejects late reveal (after revealDeadline)", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const c = createBidCommitment(100);
		auction.commit("alice", c, t);
		clock.bump(1_000);
		clock.bump(1_500); // past reveal deadline
		expect(() => auction.reveal("alice", 100, c.nonce, clock.now())).toThrow(/deadline/);
	});

	it("re-commit replaces the prior commitment and invalidates any reveal", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const first = createBidCommitment(100);
		const second = createBidCommitment(200);
		auction.commit("alice", first, t);
		auction.commit("alice", second, t);
		clock.bump(1_000);
		// Revealing with the FIRST nonce must now fail.
		expect(() => auction.reveal("alice", 100, first.nonce, clock.now())).toThrow(/does not match/);
		// Revealing with the SECOND nonce succeeds.
		expect(() => auction.reveal("alice", 200, second.nonce, clock.now())).not.toThrow();
	});

	it("rejects negative reserve price", () => {
		const clock = makeClock();
		const t = clock.now();
		expect(() => new VickreyAuction(openListing({ reservePrice: -1 }, t), t)).toThrow();
	});

	it("rejects revealDeadline <= commitDeadline", () => {
		const clock = makeClock();
		const t = clock.now();
		expect(
			() =>
				new VickreyAuction(openListing({ commitDeadline: t + 100, revealDeadline: t + 50 }, t), t),
		).toThrow();
	});
});

describe("VickreyAuction — tie-break & lifecycle", () => {
	it("ties broken by earlier reveal timestamp", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const a = createBidCommitment(500);
		const b = createBidCommitment(500);
		auction.commit("alice", a, t);
		auction.commit("bob", b, t);
		clock.bump(1_000);
		auction.reveal("bob", 500, b.nonce, clock.now()); // bob reveals first
		clock.bump(50);
		auction.reveal("alice", 500, a.nonce, clock.now()); // alice reveals 50ms later
		clock.bump(1_000);
		const result = auction.settle(clock.now());

		expect(result.winnerId).toBe("bob");
		expect(result.clearingPrice).toBe(500); // alice pays the same bid
	});

	it("ties broken by bidderId when timestamps are equal", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const a = createBidCommitment(500);
		const b = createBidCommitment(500);
		auction.commit("alice", a, t);
		auction.commit("bob", b, t);
		clock.bump(1_000);
		const r = clock.now();
		// Same timestamp — sort by bidderId asc → alice first.
		auction.reveal("alice", 500, a.nonce, r);
		auction.reveal("bob", 500, b.nonce, r);
		clock.bump(1_000);
		const result = auction.settle(clock.now());

		expect(result.winnerId).toBe("alice");
	});

	it("settle is idempotent", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const a = createBidCommitment(500);
		const b = createBidCommitment(400);
		auction.commit("alice", a, t);
		auction.commit("bob", b, t);
		clock.bump(1_000);
		const r = clock.now();
		auction.reveal("alice", 500, a.nonce, r);
		auction.reveal("bob", 400, b.nonce, r);
		clock.bump(1_000);
		const first = auction.settle(clock.now());
		const second = auction.settle(clock.now());
		expect(second.winnerId).toBe(first.winnerId);
		expect(second.clearingPrice).toBe(first.clearingPrice);
	});

	it("cancel before settle → winner null, phase cancelled", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const a = createBidCommitment(500);
		auction.commit("alice", a, t);
		auction.cancel();
		expect(auction.getPhase()).toBe("cancelled");
		const result = auction.settle(clock.now());
		expect(result.phase).toBe("cancelled");
		expect(result.winnerId).toBeNull();
	});

	it("cancel after settle throws", () => {
		const clock = makeClock();
		const t = clock.now();
		const auction = new VickreyAuction(openListing({}, t), t);
		const a = createBidCommitment(500);
		auction.commit("alice", a, t);
		clock.bump(2_000);
		auction.settle(clock.now());
		expect(() => auction.cancel()).toThrow();
	});
});

describe("VickreyMarketplace", () => {
	it("createListing registers and exposes the listing", () => {
		const mp = new VickreyMarketplace({ now: makeClock().now });
		const listing = mp.createListing({
			id: "L1",
			sellerId: "s1",
			title: "GPU Hour",
			reservePrice: 50,
		});
		expect(listing.id).toBe("L1");
		expect(mp.list()).toHaveLength(1);
		expect(mp.getPhase("L1")).toBe("open");
	});

	it("createListing rejects duplicate IDs", () => {
		const mp = new VickreyMarketplace({ now: makeClock().now });
		mp.createListing({ id: "L1", sellerId: "s1", title: "x" });
		expect(() => mp.createListing({ id: "L1", sellerId: "s1", title: "x" })).toThrow();
	});

	it("commit / reveal / settle full cycle through the marketplace", () => {
		const clock = makeClock();
		const mp = new VickreyMarketplace({ now: clock.now });
		mp.createListing({
			id: "L1",
			sellerId: "s1",
			title: "x",
			reservePrice: 100,
			commitWindowMs: 1_000,
			revealWindowMs: 1_000,
		});

		const alice = mp.commit({ listingId: "L1", bidderId: "alice", amount: 500 });
		const bob = mp.commit({ listingId: "L1", bidderId: "bob", amount: 400 });
		expect(alice.commitment.hash).toMatch(/^[0-9a-f]{64}$/);

		clock.bump(1_000); // past commit deadline
		mp.reveal("L1", "alice", 500, alice.commitment.nonce);
		mp.reveal("L1", "bob", 400, bob.commitment.nonce);
		clock.bump(1_000); // past reveal deadline
		const settled = mp.settle("L1");
		expect(settled.result.winnerId).toBe("alice");
		expect(settled.result.clearingPrice).toBe(400);
	});

	it("commit returns BidCommitment so the caller can keep the nonce", () => {
		const mp = new VickreyMarketplace({ now: makeClock().now });
		mp.createListing({ id: "L1", sellerId: "s1", title: "x" });
		const c = mp.commit({ listingId: "L1", bidderId: "alice", amount: 100 });
		expect(c.commitment.nonce).toMatch(/^[0-9a-f]{64}$/);
		// Calling reveal with that nonce must succeed.
		mp.reveal("L1", "alice", 100, c.commitment.nonce);
	});

	it("getListing/getPhase/getResult reflect state changes", () => {
		const clock = makeClock();
		const mp = new VickreyMarketplace({ now: clock.now });
		mp.createListing({
			id: "L1",
			sellerId: "s1",
			title: "x",
			commitWindowMs: 1_000,
			revealWindowMs: 1_000,
		});
		expect(mp.getListing("L1")?.id).toBe("L1");
		expect(mp.getPhase("L1")).toBe("open");
		expect(mp.getResult("L1")).toBeNull();
		const c = mp.commit({ listingId: "L1", bidderId: "alice", amount: 100 });
		clock.bump(1_000);
		mp.reveal("L1", "alice", 100, c.commitment.nonce);
		clock.bump(1_000);
		mp.settle("L1");
		expect(mp.getPhase("L1")).toBe("settled");
		expect(mp.getResult("L1")?.winnerId).toBe("alice");
	});

	it("operations on unknown listing throw", () => {
		const mp = new VickreyMarketplace({ now: makeClock().now });
		expect(() => mp.commit({ listingId: "missing", bidderId: "alice", amount: 100 })).toThrow();
		expect(() => mp.reveal("missing", "alice", 100, "x")).toThrow();
		expect(() => mp.settle("missing")).toThrow();
	});

	it("multiple listings are independent", () => {
		const clock = makeClock();
		const mp = new VickreyMarketplace({ now: clock.now });
		mp.createListing({
			id: "A",
			sellerId: "s1",
			title: "first",
			reservePrice: 50,
			commitWindowMs: 1_000,
			revealWindowMs: 1_000,
		});
		mp.createListing({
			id: "B",
			sellerId: "s1",
			title: "second",
			reservePrice: 200,
			commitWindowMs: 1_000,
			revealWindowMs: 1_000,
		});
		const a1 = mp.commit({ listingId: "A", bidderId: "alice", amount: 100 });
		const a2 = mp.commit({ listingId: "A", bidderId: "bob", amount: 60 });
		const b1 = mp.commit({ listingId: "B", bidderId: "alice", amount: 300 });

		clock.bump(1_000);
		mp.reveal("A", "alice", 100, a1.commitment.nonce);
		mp.reveal("A", "bob", 60, a2.commitment.nonce);
		mp.reveal("B", "alice", 300, b1.commitment.nonce);
		clock.bump(1_000);

		const ra = mp.settle("A").result;
		const rb = mp.settle("B").result;

		expect(ra.winnerId).toBe("alice");
		expect(ra.clearingPrice).toBe(60);
		expect(rb.winnerId).toBe("alice");
		expect(rb.clearingPrice).toBe(200); // floor at reserve (only 1 valid bid)
	});
});

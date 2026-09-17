/**
 * Single Vickrey auction instance.
 *
 * Lifecycle:
 *   created   → open       (accepting sealed commitments)
 *   open      → reveal     (commit deadline passed)
 *   reveal    → settled    (settle() called, winner determined)
 *   any       → cancelled  (seller cancels before settle)
 *
 * Settlement (Vickrey second-price):
 *   1. Collect every reveal whose commitment matches.
 *   2. Filter out bids below reserve.
 *   3. Sort by (amount desc, reveal timestamp asc, bidderId asc).
 *   4. Winner = bidder at index 0. Clearing price = max(amount at
 *      index 1, reserve). If only one valid bid, clearing price =
 *      max(amount, reserve).
 *   5. If no valid bid, winner = null (no sale).
 */

import { type BidCommitment, verifyReveal } from "./commitment.js";

export type AuctionPhase = "open" | "reveal" | "settled" | "cancelled";

export interface AuctionListing {
	id: string;
	sellerId: string;
	title: string;
	description?: string;
	/** Minimum winning bid in credits. Below this → no sale. */
	reservePrice: number;
	/** Unix ms — last moment commits are accepted. */
	commitDeadline: number;
	/** Unix ms — last moment reveals are accepted. */
	revealDeadline: number;
	/** Unix ms when listing was created. */
	createdAt: number;
}

export interface PostedCommitment {
	bidderId: string;
	listingId: string;
	commitment: string;
	postedAt: number;
}

export interface PostedReveal {
	bidderId: string;
	listingId: string;
	amount: number;
	nonce: string;
	postedAt: number;
}

export interface RejectedReveal {
	bidderId: string;
	listingId: string;
	reason: "phase" | "no-commitment" | "mismatch" | "duplicate-bidder";
}

export interface AuctionResult {
	listingId: string;
	phase: AuctionPhase;
	winnerId: string | null;
	/** Highest bid placed (or null when no sale). */
	winningBid: number | null;
	/** What the winner pays (= max(second-highest, reserve)). */
	clearingPrice: number | null;
	/** Every distinct bidder that posted a valid commitment. */
	participants: string[];
	/** Reveals accepted into the auction. */
	revealsAccepted: number;
	/** Reveals rejected (with reason). */
	revealsRejected: RejectedReveal[];
	/** Per-bidder accepted reveals, in reveal order. */
	reveals: PostedReveal[];
}

export class AuctionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuctionError";
	}
}

interface BidderState {
	commitment: string | null;
	reveal: PostedReveal | null;
	rejected: RejectedReveal[];
}

export class VickreyAuction {
	private readonly listing: AuctionListing;
	private readonly bidders = new Map<string, BidderState>();
	private phase: AuctionPhase = "open";
	private result: AuctionResult | null = null;

	constructor(listing: AuctionListing, now: number = Date.now()) {
		this.assertValidListing(listing, now);
		this.listing = { ...listing };
	}

	get id(): string {
		return this.listing.id;
	}

	get sellerId(): string {
		return this.listing.sellerId;
	}

	getListing(): AuctionListing {
		return { ...this.listing };
	}

	getPhase(): AuctionPhase {
		return this.phase;
	}

	getResult(): AuctionResult | null {
		return this.result ? { ...this.result, reveals: [...this.result.reveals] } : null;
	}

	/**
	 * Post a sealed commitment. Idempotent per bidder — re-committing
	 * replaces the prior hash (and the original reveal, if any).
	 */
	commit(bidderId: string, commitment: BidCommitment, now: number = Date.now()): PostedCommitment {
		this.assertPhase("open", "commit");
		if (now > this.listing.commitDeadline) {
			throw new AuctionError(
				`commit deadline passed (now=${now}, deadline=${this.listing.commitDeadline})`,
			);
		}
		const state = this.bidders.get(bidderId) ?? { commitment: null, reveal: null, rejected: [] };
		state.commitment = commitment.hash;
		state.reveal = null; // invalidate any prior reveal
		this.bidders.set(bidderId, state);
		return {
			bidderId,
			listingId: this.listing.id,
			commitment: commitment.hash,
			postedAt: now,
		};
	}

	/**
	 * Reveal a bid. Verifies (amount, nonce) matches the previously
	 * committed hash. Records the reveal; settlement happens later
	 * (or immediately if deadlines allow).
	 */
	reveal(bidderId: string, amount: number, nonce: string, now: number = Date.now()): PostedReveal {
		// Allow reveals once the auction has entered the reveal phase.
		// Calling advancePhase() moves us there; if the caller hasn't,
		// do it implicitly based on time.
		if (this.phase === "open" && now >= this.listing.commitDeadline) {
			this.advancePhase(now);
		}
		if (this.phase === "open" && now > this.listing.commitDeadline) {
			throw new AuctionError(
				`commit deadline passed (now=${now}, deadline=${this.listing.commitDeadline})`,
			);
		}
		if (now > this.listing.revealDeadline) {
			throw new AuctionError(
				`reveal deadline passed (now=${now}, deadline=${this.listing.revealDeadline})`,
			);
		}
		if (this.phase === "settled" || this.phase === "cancelled") {
			throw new AuctionError(`cannot reveal — auction is ${this.phase}`);
		}

		const state = this.bidders.get(bidderId);
		if (!state || !state.commitment) {
			throw new AuctionError(`reveal rejected: ${bidderId} has no commitment`);
		}
		if (state.reveal) {
			throw new AuctionError(`reveal rejected: ${bidderId} already revealed`);
		}
		if (!Number.isInteger(amount) || amount < 0) {
			throw new AuctionError(`reveal rejected: amount must be a non-negative integer`);
		}
		if (!verifyReveal(state.commitment, amount, nonce)) {
			throw new AuctionError(`reveal rejected: (amount, nonce) does not match commitment`);
		}

		const posted: PostedReveal = {
			bidderId,
			listingId: this.listing.id,
			amount,
			nonce,
			postedAt: now,
		};
		state.reveal = posted;
		return posted;
	}

	/**
	 * Move the auction into the reveal phase. Called automatically
	 * during reveal() / settle() once the commit deadline has passed.
	 */
	advancePhase(now: number = Date.now()): void {
		if (this.phase === "settled" || this.phase === "cancelled") return;
		if (this.phase === "open" && now >= this.listing.commitDeadline) {
			this.phase = "reveal";
		}
	}

	/**
	 * Cancel the auction before settlement. Once settled or cancelled,
	 * cannot be undone.
	 */
	cancel(reason: string = "cancelled"): void {
		if (this.phase === "settled") {
			throw new AuctionError("cannot cancel a settled auction");
		}
		this.phase = "cancelled";
		this.result = {
			listingId: this.listing.id,
			phase: "cancelled",
			winnerId: null,
			winningBid: null,
			clearingPrice: null,
			participants: [...this.bidders.keys()],
			revealsAccepted: 0,
			revealsRejected: [],
			reveals: [],
		};
		void reason; // reserved for future audit log
	}

	/**
	 * Settle the auction. Computes the Vickrey winner + clearing price
	 * from all valid reveals. Idempotent — repeated calls return the
	 * cached result.
	 */
	settle(now: number = Date.now()): AuctionResult {
		if (this.phase === "cancelled") {
			return this.result!;
		}
		if (this.phase === "settled") {
			return this.result!;
		}
		this.advancePhase(now);
		if (this.phase !== "reveal") {
			throw new AuctionError(
				`settle: auction has not entered reveal phase yet (phase=${this.phase})`,
			);
		}

		const reveals: PostedReveal[] = [];
		const rejected: RejectedReveal[] = [];
		const participants = [...this.bidders.keys()].sort();

		for (const bidderId of participants) {
			const state = this.bidders.get(bidderId)!;
			if (!state.commitment) {
				rejected.push({ bidderId, listingId: this.listing.id, reason: "no-commitment" });
				continue;
			}
			if (!state.reveal) {
				rejected.push({ bidderId, listingId: this.listing.id, reason: "mismatch" });
				continue;
			}
			if (!verifyReveal(state.commitment, state.reveal.amount, state.reveal.nonce)) {
				rejected.push({ bidderId, listingId: this.listing.id, reason: "mismatch" });
				continue;
			}
			reveals.push(state.reveal);
		}

		// Sort by (amount desc, postedAt asc, bidderId asc) for tie-break.
		const sorted = [...reveals].sort((a, b) => {
			if (b.amount !== a.amount) return b.amount - a.amount;
			if (a.postedAt !== b.postedAt) return a.postedAt - b.postedAt;
			return a.bidderId.localeCompare(b.bidderId);
		});

		const reserve = this.listing.reservePrice;
		const eligible = sorted.filter((r) => r.amount >= reserve);

		if (eligible.length === 0) {
			this.phase = "settled";
			this.result = {
				listingId: this.listing.id,
				phase: "settled",
				winnerId: null,
				winningBid: null,
				clearingPrice: null,
				participants,
				revealsAccepted: reveals.length,
				revealsRejected: rejected,
				reveals,
			};
			return this.result;
		}

		const winner = eligible[0]!;
		// Second-price: winner pays the second-highest valid bid, floored
		// at the reserve price (you can't pay less than what would have
		// triggered a sale).
		const secondHighest = eligible.length >= 2 ? eligible[1]!.amount : reserve;
		const clearingPrice = Math.max(secondHighest, reserve);

		this.phase = "settled";
		this.result = {
			listingId: this.listing.id,
			phase: "settled",
			winnerId: winner.bidderId,
			winningBid: winner.amount,
			clearingPrice,
			participants,
			revealsAccepted: reveals.length,
			revealsRejected: rejected,
			reveals,
		};
		return this.result;
	}

	private assertPhase(expected: AuctionPhase, op: string): void {
		if (this.phase !== expected) {
			throw new AuctionError(`${op}: auction is in phase ${this.phase}, expected ${expected}`);
		}
	}

	private assertValidListing(listing: AuctionListing, now: number): void {
		if (!listing.id || typeof listing.id !== "string") {
			throw new AuctionError("listing.id must be a non-empty string");
		}
		if (!listing.sellerId || typeof listing.sellerId !== "string") {
			throw new AuctionError("listing.sellerId must be a non-empty string");
		}
		if (!Number.isInteger(listing.reservePrice) || listing.reservePrice < 0) {
			throw new AuctionError("listing.reservePrice must be a non-negative integer");
		}
		if (!Number.isFinite(listing.commitDeadline)) {
			throw new AuctionError("listing.commitDeadline must be a finite timestamp");
		}
		if (!Number.isFinite(listing.revealDeadline)) {
			throw new AuctionError("listing.revealDeadline must be a finite timestamp");
		}
		if (listing.revealDeadline <= listing.commitDeadline) {
			throw new AuctionError("listing.revealDeadline must be after commitDeadline");
		}
		if (listing.commitDeadline <= now) {
			throw new AuctionError("listing.commitDeadline must be in the future");
		}
	}
}

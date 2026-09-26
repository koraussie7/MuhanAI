/**
 * VickreyMarketplace — manages many Vickrey auctions on a single
 * instance. Each listing has its own sealed-bid commit-reveal cycle,
 * with the marketplace providing the higher-level API: createListing,
 * commit, reveal, settle, list.
 *
 * Time is injected via `now()` so callers (and tests) can simulate
 * clock progression without monkey-patching Date.now globally.
 */

import {
	type AuctionListing,
	type AuctionPhase,
	type AuctionResult,
	type PostedCommitment,
	type PostedReveal,
	VickreyAuction,
} from "./auction.js";
import { type BidCommitment, createBidCommitment, generateNonce } from "./commitment.js";

export interface CreateListingInput {
	id: string;
	sellerId: string;
	title: string;
	description?: string;
	reservePrice?: number;
	/** How long the commit phase lasts (ms from creation). */
	commitWindowMs?: number;
	/** How long the reveal phase lasts (ms from commit deadline). */
	revealWindowMs?: number;
}

export interface CommitInput {
	listingId: string;
	bidderId: string;
	amount: number;
	nonce?: string;
}

export interface CommitOutput {
	commitment: BidCommitment;
	posted: PostedCommitment;
}

export interface RevealOutput {
	posted: PostedReveal;
}

export interface SettleOutput {
	result: AuctionResult;
}

const DEFAULT_COMMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_REVEAL_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export class MarketplaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MarketplaceError";
	}
}

export class VickreyMarketplace {
	private readonly auctions = new Map<string, VickreyAuction>();
	private readonly clock: () => number;

	constructor(opts: { now?: () => number } = {}) {
		this.clock = opts.now ?? Date.now;
	}

	createListing(input: CreateListingInput): AuctionListing {
		if (this.auctions.has(input.id)) {
			throw new MarketplaceError(`listing ${input.id} already exists`);
		}
		const now = this.clock();
		const commitWindow = input.commitWindowMs ?? DEFAULT_COMMIT_WINDOW_MS;
		const revealWindow = input.revealWindowMs ?? DEFAULT_REVEAL_WINDOW_MS;
		const listing: AuctionListing = {
			id: input.id,
			sellerId: input.sellerId,
			title: input.title,
			description: input.description,
			reservePrice: input.reservePrice ?? 0,
			commitDeadline: now + commitWindow,
			revealDeadline: now + commitWindow + revealWindow,
			createdAt: now,
		};
		const auction = new VickreyAuction(listing, now);
		this.auctions.set(listing.id, auction);
		return auction.getListing();
	}

	/**
	 * Commit a sealed bid. Generates a fresh nonce unless the caller
	 * supplies one (useful for tests / deterministic flows). Returns
	 * the BidCommitment so the caller can keep the secret nonce until
	 * the reveal phase.
	 */
	commit(input: CommitInput): CommitOutput {
		const auction = this.requireAuction(input.listingId);
		const commitment = createBidCommitment(input.amount, input.nonce ?? generateNonce());
		const posted = auction.commit(input.bidderId, commitment, this.clock());
		return { commitment, posted };
	}

	reveal(listingId: string, bidderId: string, amount: number, nonce: string): RevealOutput {
		const auction = this.requireAuction(listingId);
		const posted = auction.reveal(bidderId, amount, nonce, this.clock());
		return { posted };
	}

	settle(listingId: string): SettleOutput {
		const auction = this.requireAuction(listingId);
		return { result: auction.settle(this.clock()) };
	}

	cancel(listingId: string, reason?: string): void {
		const auction = this.requireAuction(listingId);
		auction.cancel(reason);
	}

	getListing(id: string): AuctionListing | null {
		return this.auctions.get(id)?.getListing() ?? null;
	}

	getPhase(id: string): AuctionPhase | null {
		return this.auctions.get(id)?.getPhase() ?? null;
	}

	getResult(id: string): AuctionResult | null {
		return this.auctions.get(id)?.getResult() ?? null;
	}

	list(): AuctionListing[] {
		return [...this.auctions.values()].map((a) => a.getListing());
	}

	private requireAuction(id: string): VickreyAuction {
		const a = this.auctions.get(id);
		if (!a) throw new MarketplaceError(`listing ${id} not found`);
		return a;
	}
}

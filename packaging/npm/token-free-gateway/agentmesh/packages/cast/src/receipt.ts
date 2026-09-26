/**
 * Co-signed call receipts (Phase C2).
 *
 * Every hop in a recursive cast — caller → delegated agent → peer →
 * model — emits a `CallReceipt`. The receiver of the receipt is free to
 * verify the caller's signature against its peer-mesh public key.
 *
 * Pattern source: openhydra co-signed receipt. Two design choices we
 * keep aligned with the upstream:
 *
 *   - The receipt carries enough context to reconstruct the call
 *     (model id, latency, token count) without revealing the full
 *     request body. This is what lets the receipt be gossiped across
 *     peers without leaking private prompts.
 *   - The signatures are over the canonical bytes with the `signatures`
 *     field stripped, mirroring `verifyManifest` in `@agentmesh/noema`.
 *     Two receipts computed on the same body are byte-identical.
 */

import { canonicalJson } from "@agentmesh/noema";

export interface CallReceipt {
	id: string;
	callerPeerId: string;
	calleePeerId: string;
	parentReceiptId?: string;
	modelId: string;
	promptTokens: number;
	completionTokens: number;
	latencyMs: number;
	timestamp: number;
	signatures: ReceiptSignatures;
}

export interface ReceiptSignatures {
	caller?: string;
	callee?: string;
}

export interface ReceiptSigner {
	sign(bytes: Uint8Array): string; // base64
}

const RECEIPT_HASH_ALGORITHM = "blake3";
const FALLBACK_HASH_ALGORITHM = "sha256";

function hashAlgorithm(): "blake3" | "sha256" {
	try {
		const { createHash } = require("node:crypto") as typeof import("node:crypto");
		createHash("blake3").update("").digest();
		return "blake3";
	} catch {
		return FALLBACK_HASH_ALGORITHM;
	}
}

/**
 * Canonical bytes for signing/hashing: the receipt with both signatures
 * stripped. Two callers running `canonicalReceiptBytes(r)` on the same
 * body must agree byte-for-byte.
 */
export function canonicalReceiptBytes(receipt: CallReceipt): Uint8Array {
	const { signatures, ...rest } = receipt;
	void signatures;
	return new TextEncoder().encode(canonicalJson(rest));
}

export interface CanonicalReceiptIdOptions {
	hash?: (bytes: Uint8Array) => string;
}

export function canonicalReceiptId(
	receipt: CallReceipt,
	options: CanonicalReceiptIdOptions = {},
): string {
	const bytes = canonicalReceiptBytes(receipt);
	const digest = options.hash ? options.hash(bytes) : defaultHash(bytes);
	return `${hashAlgorithm()}:${digest}`;
}

function defaultHash(bytes: Uint8Array): string {
	const { createHash } = require("node:crypto") as typeof import("node:crypto");
	try {
		return createHash("blake3").update(bytes).digest("hex");
	} catch {
		// Older OpenSSL builds may not advertise BLAKE3; fall back to
		// SHA-256 — the receipt is still content-addressed, just on a
		// different algorithm.
		return createHash("sha256").update(bytes).digest("hex");
	}
}

export interface VerifyReceiptInput {
	receipt: CallReceipt;
	now?: () => number;
	maxAgeMs?: number;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ReceiptVerification {
	ok: boolean;
	reason?: string;
}

export function verifyReceiptStructure(input: VerifyReceiptInput): ReceiptVerification {
	const { receipt, now = Date.now, maxAgeMs = DEFAULT_MAX_AGE_MS } = input;

	if (!receipt.id) return { ok: false, reason: "missing id" };
	if (!receipt.callerPeerId) return { ok: false, reason: "missing callerPeerId" };
	if (!receipt.calleePeerId) return { ok: false, reason: "missing calleePeerId" };
	if (!receipt.modelId) return { ok: false, reason: "missing modelId" };
	if (receipt.timestamp <= 0) return { ok: false, reason: "invalid timestamp" };
	if (now() - receipt.timestamp > maxAgeMs) {
		return { ok: false, reason: "receipt too old" };
	}
	if (receipt.latencyMs < 0) return { ok: false, reason: "negative latency" };
	if (receipt.promptTokens < 0 || receipt.completionTokens < 0) {
		return { ok: false, reason: "negative token count" };
	}
	// Caller signature is required for the receipt to be billable;
	// callee signature is optional until the callee acknowledges the work.
	if (!receipt.signatures.caller) {
		return { ok: false, reason: "missing caller signature" };
	}
	return { ok: true };
}

export interface ReceiptLedgerEntry {
	receipt: CallReceipt;
	recordedAt: number;
}

/**
 * Append-only receipt ledger. Used by bitterbot reputation scoring and
 * by the credit system to settle payments for P2P inference. The ledger
 * is intentionally tiny: callers that want richer analytics should pipe
 * it into a database.
 */
export class ReceiptLedger {
	private readonly entries: ReceiptLedgerEntry[] = [];
	private readonly maxEntries: number;

	constructor(options: { maxEntries?: number } = {}) {
		this.maxEntries = options.maxEntries ?? 10_000;
	}

	append(receipt: CallReceipt, now: number = Date.now()): void {
		this.entries.push({ receipt, recordedAt: now });
		while (this.entries.length > this.maxEntries) this.entries.shift();
	}

	byPeer(peerId: string): ReceiptLedgerEntry[] {
		return this.entries.filter(
			(entry) =>
				entry.receipt.callerPeerId === peerId ||
				entry.receipt.calleePeerId === peerId,
		);
	}

	all(): ReceiptLedgerEntry[] {
		return [...this.entries];
	}

	size(): number {
		return this.entries.length;
	}
}

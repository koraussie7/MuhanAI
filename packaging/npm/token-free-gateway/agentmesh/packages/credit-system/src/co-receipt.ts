/**
 * Co-receipts metering ledger.
 *
 * Pattern reference: p2ptokens (no LICENSE — pattern only, code self-authored).
 *
 * Each resource consumption between two peers produces a signed receipt.
 * A ratio = resources_provided / resources_consumed is maintained per peer.
 * Hysteresis prevents oscillation when ratio hovers near threshold.
 *
 * Design decisions:
 *   - signReceipt takes a `Signer` interface (not @libp2p/interface PrivateKey)
 *     to keep this module libp2p-agnostic. Callers wrap `PrivateKey.sign` as needed.
 *   - Receipts are append-only; ratio is a derived cache.
 *   - NEWCOMER_GRACE_TOKENS = 100 (prevents cold-start penalization).
 *   - HYSTERESIS_BAND = 0.05 (ratio delta required to flip pay/drain mode).
 *
 * Self-authored rationale: p2ptokens GitHub repo has no LICENSE file (see ADR-0003 §1
 * and CODE-INTEGRATION-PLAN.md §11). Hysteresis + grace tokens are general ledger
 * design patterns, not p2ptokens-specific inventions.
 */

export interface Signer {
	sign(data: Uint8Array): Promise<Uint8Array>;
}

export interface CoReceipt {
	id: string;
	payerPeerId: string;
	payeePeerId: string;
	resourceUnits: number;
	agreedRatio: number;
	timestamp: number;
	payerSignature: string;
	payeeSignature?: string;
}

export type LedgerMode = "pay" | "drain";

export const NEWCOMER_GRACE_TOKENS = 100;
export const HYSTERESIS_BAND = 0.05;

function toBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

export function signReceipt(
	signer: Signer,
	receiptId: string,
	resourceUnits: number,
): Promise<string> {
	const canonical = new TextEncoder().encode(`${receiptId}|${resourceUnits}`);
	return signer.sign(canonical).then(toBase64);
}

export class CoReceiptLedger {
	private receipts = new Map<string, CoReceipt>();
	private ratios = new Map<string, number>();
	private graceTokens = new Map<string, number>();
	private modeCache = new Map<string, LedgerMode>();

	append(receipt: CoReceipt): void {
		this.receipts.set(receipt.id, receipt);
		this.recomputeRatios();
	}

	private recomputeRatios(): void {
		const totals = new Map<string, { provided: number; consumed: number }>();
		for (const r of this.receipts.values()) {
			const payer = totals.get(r.payerPeerId) ?? { provided: 0, consumed: 0 };
			payer.consumed += r.resourceUnits;
			totals.set(r.payerPeerId, payer);

			const payee = totals.get(r.payeePeerId) ?? { provided: 0, consumed: 0 };
			payee.provided += r.resourceUnits;
			totals.set(r.payeePeerId, payee);
		}
		this.ratios.clear();
		for (const [peerId, t] of totals.entries()) {
			this.ratios.set(peerId, t.consumed === 0 ? 0 : t.provided / t.consumed);
		}
	}

	ratio(peerId: string): number {
		return this.ratios.get(peerId) ?? 0;
	}

	consumeGrace(peerId: string, tokens: number): boolean {
		if (!Number.isInteger(tokens) || tokens < 0) {
			throw new Error(`co-receipt: tokens must be non-negative integer (got ${tokens})`);
		}
		const remaining = this.graceTokens.get(peerId) ?? NEWCOMER_GRACE_TOKENS;
		if (remaining < tokens) return false;
		this.graceTokens.set(peerId, remaining - tokens);
		return true;
	}

	graceRemaining(peerId: string): number {
		return this.graceTokens.get(peerId) ?? NEWCOMER_GRACE_TOKENS;
	}

	shouldPay(peerId: string, threshold = 1.0): boolean {
		const hasRatio = this.ratios.has(peerId);
		const hasMode = this.modeCache.has(peerId);
		if (!hasRatio && !hasMode) {
			return true;
		}
		const ratio = this.ratio(peerId);
		const prev = this.modeCache.get(peerId) ?? "pay";
		let next: LedgerMode;
		if (prev === "pay") {
			next = ratio < threshold - HYSTERESIS_BAND ? "drain" : "pay";
		} else {
			next = ratio > threshold + HYSTERESIS_BAND ? "pay" : "drain";
		}
		this.modeCache.set(peerId, next);
		return next === "pay";
	}

	modeOf(peerId: string): LedgerMode {
		if (!this.ratios.has(peerId) && !this.modeCache.has(peerId)) {
			return "pay";
		}
		return this.modeCache.get(peerId) ?? "pay";
	}

	get(id: string): CoReceipt | undefined {
		return this.receipts.get(id);
	}

	size(): number {
		return this.receipts.size;
	}

	all(): CoReceipt[] {
		return Array.from(this.receipts.values());
	}
}

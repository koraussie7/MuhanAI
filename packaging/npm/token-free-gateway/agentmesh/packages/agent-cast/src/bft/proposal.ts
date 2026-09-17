/**
 * Signed proposal — the unit of consensus in BFT.
 *
 * A proposal carries:
 *   - view / seq   : consensus-instance identifiers
 *   - payloadHash  : 32-byte digest of the proposed value (the actual
 *                    answer string lives outside the proposal envelope)
 *   - proposerId   : who proposed it (must be a known participant)
 *   - signature    : over the canonical encoding of the above fields
 *
 * Equivocation is detected by collecting two proposals from the same
 * proposerId with the same (view, seq) but different payloadHash — the
 * detector returns both as cryptographic evidence of misbehavior.
 */

import type { Signer } from "./signatures.js";

export interface SignedProposal {
	view: number;
	seq: number;
	proposerId: string;
	payloadHash: string; // hex (32 bytes == 64 hex chars)
	signature: string;
}

export interface UnsignedProposal {
	view: number;
	seq: number;
	proposerId: string;
	payloadHash: string;
}

export class ProposalError extends Error {
	constructor(
		message: string,
		public readonly proposal?: SignedProposal,
	) {
		super(message);
		this.name = "ProposalError";
	}
}

/**
 * Compute the canonical byte encoding that gets signed. Stable field
 * order is critical: a reordering would invalidate every signature.
 */
export function canonicalEncode(p: UnsignedProposal): Uint8Array {
	const json = JSON.stringify({
		v: 1,
		view: p.view,
		seq: p.seq,
		proposerId: p.proposerId,
		payloadHash: p.payloadHash,
	});
	return new TextEncoder().encode(json);
}

/** Hash an arbitrary UTF-8 string into a 32-byte digest (SHA-256). */
export function hashPayload(payload: string): string {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
	const digest = nodeCrypto.createHash("sha256").update(payload, "utf8").digest();
	let hex = "";
	for (let i = 0; i < digest.length; i++)
		hex += (digest[i]! >>> 4).toString(16) + (digest[i]! & 0xf).toString(16);
	return hex;
}

export function digestFromHex(hash: string): Uint8Array {
	if (!/^[0-9a-f]{64}$/i.test(hash)) {
		throw new ProposalError(`proposal: invalid payloadHash (must be 64-char hex): ${hash}`);
	}
	const out = new Uint8Array(32);
	for (let i = 0; i < 32; i++) out[i] = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
	return out;
}

/** Construct a SignedProposal by signing the canonical bytes with the proposer's Signer. */
export function signProposal(p: UnsignedProposal, signer: Signer): SignedProposal {
	if (signer.id !== p.proposerId) {
		throw new ProposalError(
			`signProposal: signer.id (${signer.id}) ≠ proposerId (${p.proposerId})`,
		);
	}
	const bytes = canonicalEncode(p);
	const signature = signer.sign(bytes);
	return { ...p, signature };
}

/** Verify a proposal's signature under the signers registered to the consensus instance. */
export function verifyProposal(p: SignedProposal, signer: Signer): boolean {
	if (signer.id !== p.proposerId) return false;
	let bytes: Uint8Array;
	try {
		bytes = canonicalEncode(p);
	} catch {
		return false;
	}
	return signer.verify(bytes, p.signature);
}

/** Stable identifier for a (view, seq, proposer) — used to dedupe votes. */
export function proposalKey(p: Pick<SignedProposal, "view" | "seq" | "proposerId">): string {
	return `${p.view}:${p.seq}:${p.proposerId}`;
}

/** Stable identifier for a (view, seq, payloadHash) — used to count votes per value. */
export function valueKey(p: Pick<SignedProposal, "view" | "seq" | "payloadHash">): string {
	return `${p.view}:${p.seq}:${p.payloadHash}`;
}

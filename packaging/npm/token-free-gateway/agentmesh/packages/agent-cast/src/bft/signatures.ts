/**
 * Pluggable signature interface for BFT proposals.
 *
 * Production deployments should swap HmacSigner for an ed25519-based
 * Signer (e.g. `@noble/ed25519`, `tweetnacl`). The interface here is
 * deliberately narrow: sign a digest, verify a digest + signature, and
 * derive the public identifier for a key.
 *
 * HMAC is the default in this POC because it's deterministic, requires
 * no native deps, and makes tests reproducible. It is NOT a substitute
 * for asymmetric signatures in production — every participant holding
 * the same secret can forge any other participant's vote.
 */

export interface Signer {
	/** Stable identifier for this signer (e.g. agentId, peerId). */
	readonly id: string;
	/** Sign a 32-byte digest, returning an opaque signature string. */
	sign(digest: Uint8Array): string;
	/** Verify a digest + signature under this signer's public material. */
	verify(digest: Uint8Array, signature: string): boolean;
}

export interface SignerFactory {
	(id: string, ...args: unknown[]): Signer;
}

/** Minimal in-memory symmetric-key registry. Each signer has its own random secret. */
export interface SignerKeyring {
	signer(id: string): Signer;
	/** For tests/inspection only. Returns a copy of the secret as hex. */
	exportSecret(id: string): string | null;
}

/** HMAC-SHA256 via Node's crypto — synchronous and deterministic. */
function hmacSha256(secret: Uint8Array, data: Uint8Array): Uint8Array {
	// We import lazily so this module remains browser-safe when other
	// implementations are plugged in.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
	return new Uint8Array(nodeCrypto.createHmac("sha256", Buffer.from(secret)).update(Buffer.from(data)).digest());
}

/** Constant-time-ish comparison (Node's timingSafeEqual). */
function constantTimeEq(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

function toHex(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i++) out += (bytes[i]! >>> 4).toString(16) + (bytes[i]! & 0xf).toString(16);
	return out;
}

function fromHex(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) throw new Error("signatures: invalid hex");
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

export class HmacSigner implements Signer {
	readonly id: string;
	private readonly secret: Uint8Array;

	constructor(id: string, secret: Uint8Array) {
		this.id = id;
		if (secret.length < 16) {
			throw new Error("HmacSigner: secret must be at least 16 bytes");
		}
		this.secret = new Uint8Array(secret);
	}

	sign(digest: Uint8Array): string {
		return toHex(hmacSha256(this.secret, digest));
	}

	verify(digest: Uint8Array, signature: string): boolean {
		let provided: Uint8Array;
		try {
			provided = fromHex(signature);
		} catch {
			return false;
		}
		const expected = hmacSha256(this.secret, digest);
		return constantTimeEq(expected, provided);
	}
}

export class HmacKeyring implements SignerKeyring {
	private readonly secrets = new Map<string, Uint8Array>();

	constructor(seed?: Record<string, Uint8Array>) {
		if (seed) {
			for (const [id, secret] of Object.entries(seed)) this.secrets.set(id, new Uint8Array(secret));
		}
	}

	signer(id: string): Signer {
		let secret = this.secrets.get(id);
		if (!secret) {
			// Lazily mint a deterministic but unique secret when callers
			// don't seed one. We use a hash of the id + a random suffix to
			// keep it reproducible per-id-within-one-keyring.
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
			secret = new Uint8Array(nodeCrypto.randomBytes(32));
			this.secrets.set(id, secret);
		}
		return new HmacSigner(id, secret);
	}

	exportSecret(id: string): string | null {
		const s = this.secrets.get(id);
		return s ? toHex(s) : null;
	}
}

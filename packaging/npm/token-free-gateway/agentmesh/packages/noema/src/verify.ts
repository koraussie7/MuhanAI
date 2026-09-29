/**
 * Manifest verification.
 *
 * Mirrors noema-atlas: a manifest is the source of truth. Sources provide
 * bytes; the manifest provides what those bytes ought to be. Every byte
 * is checked against the manifest before it is written to the cache, and
 * a source caught serving bad data is set aside for the rest of the
 * session (see Phase B plan §5 — bad source ban).
 *
 * Two layers of verification:
 *   1. `verifyManifest` — structural checks (required fields, hash format,
 *      `contentId` matches the canonical body). Always run on receive.
 *   2. `verifyFile` — hash a real file against the manifest's `hashes`.
 *      Run after a download completes, before the file lands in the
 *      shared cache.
 */

import { createHash } from "node:crypto";
import { canonicalManifestBytes, hashManifest, resolveHashAlgorithm } from "./manifest.js";
import type { ModelManifest } from "./types.js";

export interface VerificationFailure {
	field: string;
	reason: string;
}

export interface VerificationResult {
	ok: boolean;
	failures: VerificationFailure[];
}

function ok(): VerificationResult {
	return { ok: true, failures: [] };
}

function fail(field: string, reason: string): VerificationResult {
	return { ok: false, failures: [{ field, reason }] };
}

const HASH_RE = /^(blake3|sha256):[a-f0-9]{64}$/;
const CONTENT_ID_RE = /^(blake3|sha256):[a-f0-9]{64}$/;

function isHex64(s: string): boolean {
	return /^[a-f0-9]{64}$/.test(s);
}

/**
 * Structural verification. Does not check signatures — that's a separate
 * concern handled by the caller, since it depends on a trusted-key store
 * (noema-atlas: OS keystore; us: peer-mesh identity).
 */
export function verifyManifest(manifest: unknown): VerificationResult {
	if (!manifest || typeof manifest !== "object") {
		return fail("root", "manifest must be an object");
	}
	const m = manifest as Record<string, unknown>;

	// Required fields.
	for (const field of ["id", "name", "sizeBytes", "contentId", "hashes", "sources", "createdAt"]) {
		if (!(field in m)) return fail(field, `missing required field`);
	}
	if (typeof m.id !== "string" || m.id.length === 0) return fail("id", "must be non-empty string");
	if (typeof m.name !== "string" || m.name.length === 0)
		return fail("name", "must be non-empty string");
	if (typeof m.sizeBytes !== "number" || m.sizeBytes <= 0) {
		return fail("sizeBytes", "must be a positive number");
	}
	if (typeof m.contentId !== "string" || !CONTENT_ID_RE.test(m.contentId)) {
		return fail("contentId", "must match `<algo>:<64-hex>`");
	}
	if (typeof m.createdAt !== "string" || Number.isNaN(Date.parse(m.createdAt))) {
		return fail("createdAt", "must be an ISO-8601 string");
	}

	// Optional string fields.
	for (const field of ["description", "license", "quantization", "signature"]) {
		if (field in m && m[field] !== undefined && typeof m[field] !== "string") {
			return fail(field, "must be string when present");
		}
	}

	// `hashes` block.
	const hashes = m.hashes;
	if (!hashes || typeof hashes !== "object") return fail("hashes", "must be an object");
	const h = hashes as Record<string, unknown>;
	if (typeof h.algorithm !== "string" || !["blake3", "sha256"].includes(h.algorithm)) {
		return fail("hashes.algorithm", 'must be "blake3" or "sha256"');
	}
	const hasBlake3 = typeof h.blake3 === "string" && isHex64(h.blake3);
	const hasSha256 = typeof h.sha256 === "string" && isHex64(h.sha256);
	if (!hasBlake3 && !hasSha256) {
		return fail("hashes", "must contain at least blake3 or sha256 (hex, 64 chars)");
	}
	if (h.merkleRoot !== undefined) {
		if (typeof h.merkleRoot !== "string" || !isHex64(h.merkleRoot)) {
			return fail("hashes.merkleRoot", "must be hex(64) when present");
		}
	}

	// `sources` array.
	if (!Array.isArray(m.sources) || m.sources.length === 0) {
		return fail("sources", "must be a non-empty array");
	}
	for (let i = 0; i < m.sources.length; i++) {
		const s = m.sources[i];
		if (!s || typeof s !== "object") return fail(`sources[${i}]`, "must be an object");
		const source = s as Record<string, unknown>;
		if (source.kind === "hf") {
			if (typeof source.repo !== "string" || source.repo.length === 0) {
				return fail(`sources[${i}].repo`, "must be non-empty string");
			}
			if (typeof source.file !== "string" || source.file.length === 0) {
				return fail(`sources[${i}].file`, "must be non-empty string");
			}
		} else if (source.kind === "https") {
			if (typeof source.url !== "string") return fail(`sources[${i}].url`, "must be string");
			try {
				// Reject anything that is not an absolute http(s) URL — model
				// sources come from the open web and we don't want file:// or
				// data: slipping through.
				const u = new URL(source.url);
				if (u.protocol !== "http:" && u.protocol !== "https:") {
					return fail(`sources[${i}].url`, "must be http(s)");
				}
			} catch {
				return fail(`sources[${i}].url`, "must be a valid URL");
			}
			if (source.integrity !== undefined) {
				if (typeof source.integrity !== "string" || !HASH_RE.test(source.integrity)) {
					return fail(`sources[${i}].integrity`, "must match `<algo>:<64-hex>`");
				}
			}
		} else if (source.kind === "mesh") {
			if (typeof source.peer !== "string" || source.peer.length === 0) {
				return fail(`sources[${i}].peer`, "must be non-empty string");
			}
			if (typeof source.contentId !== "string" || !CONTENT_ID_RE.test(source.contentId)) {
				return fail(`sources[${i}].contentId`, "must match `<algo>:<64-hex>`");
			}
		} else {
			return fail(`sources[${i}].kind`, `unknown kind: ${String(source.kind)}`);
		}
	}

	// `contentId` must be derivable from the canonical body.
	const claimed = m.contentId as string;
	const computed = hashManifest(m as unknown as ModelManifest);
	if (claimed !== computed) {
		return fail("contentId", `mismatch (claimed=${claimed} computed=${computed})`);
	}

	return ok();
}

/**
 * Hash a real file and compare against the manifest's `hashes`. Reads the
 * file in a streaming-friendly way (`createHash` accepts a buffer, but
 * for very large weights callers should pass an async iterator — see
 * `verifyStream`).
 *
 * Skips algorithms the runtime does not support (e.g. BLAKE3 on an older
 * OpenSSL build) — falls through to the next hash in the manifest.
 *
 * Returns the algorithm that matched, or null on mismatch.
 */
export function verifyFile(
	manifest: ModelManifest,
	fileBytes: Uint8Array,
): { ok: true; algorithm: "blake3" | "sha256" } | { ok: false; reason: string } {
	if (manifest.sizeBytes !== fileBytes.byteLength) {
		return {
			ok: false,
			reason: `size mismatch (manifest=${manifest.sizeBytes} actual=${fileBytes.byteLength})`,
		};
	}
	const supported = new Set<string>();
	try {
		supported.add(resolveHashAlgorithm("blake3"));
	} catch {
		/* unreachable: resolveHashAlgorithm guarantees sha256 fallback */
	}
	try {
		supported.add(resolveHashAlgorithm("sha256"));
	} catch {
		/* unsupported at all — fall through and report mismatch */
	}
	if (manifest.hashes.blake3 && supported.has("blake3")) {
		const got = createHash("blake3").update(fileBytes).digest("hex");
		if (got === manifest.hashes.blake3) return { ok: true, algorithm: "blake3" };
	}
	if (manifest.hashes.sha256 && supported.has("sha256")) {
		const got = createHash("sha256").update(fileBytes).digest("hex");
		if (got === manifest.hashes.sha256) return { ok: true, algorithm: "sha256" };
	}
	return { ok: false, reason: "no hash in manifest matched the file" };
}

/**
 * Same as `verifyFile` but for chunked streams. We do not implement a
 * streaming Merkle verifier here — that lives behind a flag in the
 * Phase B plan ("catching a single poisoned chunk in the middle of a
 * download, before the rest of the file has arrived, is on the roadmap
 * and not yet in place" per noema-atlas). For now we hash the full
 * buffer once the stream ends.
 */
export async function verifyStream(
	manifest: ModelManifest,
	stream: AsyncIterable<Uint8Array>,
): Promise<{ ok: true; algorithm: "blake3" | "sha256" } | { ok: false; reason: string }> {
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of stream) {
		chunks.push(Buffer.from(chunk));
		total += chunk.byteLength;
	}
	const buf = Buffer.concat(chunks, total);
	return verifyFile(manifest, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
}

/**
 * Re-derive `contentId` after the manifest's body has been altered.
 * Exposed for symmetry with `manifest.recomputeContentId` — both
 * implementations must agree byte-for-byte.
 */
export function recomputeContentId(manifest: ModelManifest): ModelManifest {
	manifest.contentId = hashManifest(manifest);
	return manifest;
}

/**
 * Sign a manifest. The signature is over the canonical bytes of the
 * manifest with the `signature` field omitted; an Ed25519 implementation
 * is provided by the caller so this module stays platform-agnostic.
 *
 * Returns the signature as base64.
 */
export interface Signer {
	sign(bytes: Uint8Array): string; // base64
}

export function signManifest(manifest: ModelManifest, signer: Signer): ModelManifest {
	const bytes = canonicalManifestBytes(manifest);
	const signature = signer.sign(bytes);
	return { ...manifest, signature };
}

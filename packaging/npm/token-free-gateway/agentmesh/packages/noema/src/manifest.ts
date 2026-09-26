/**
 * Model manifest construction.
 *
 * Mirrors noema-atlas's "manifest is the source of truth" pattern:
 *   - The manifest describes a model by content-addressed identifiers, not
 *     by where the bytes came from.
 *   - Sources are interchangeable: a peer on another continent and the HF
 *     Hub collapse into one verified copy on disk because the bytes match
 *     `contentId`.
 *   - The signature is over the canonical JSON (sorted keys, no
 *     whitespace) so two peers computing it independently agree.
 *
 * `contentId` defaults to a noema-style identifier: `<algo>:<hex>`, where
 * the hash is computed over the canonical manifest body with the
 * `signature` field omitted (you can't sign your own signature). This is
 * the same trick as `packages/p2p/src/message-router.ts:verifySignature`.
 */

import { createHash } from "node:crypto";
import type {
	ContentHashes,
	ContentHashAlgorithm,
	ManifestSource,
	ModelManifest,
} from "./types.js";

export const MANIFEST_HASH_ALGORITHM: ContentHashAlgorithm = "blake3";

/**
 * Probe whether `node:crypto` accepts a given algorithm at runtime.
 *
 * Older or minimally-built OpenSSL distributions may not advertise
 * BLAKE3 even though Node 22+ supports it. We probe once and cache.
 */
let probed = false;
let supported: Record<string, boolean> = {};

function probeAlgorithms(): Record<string, boolean> {
	if (probed) return supported;
	probed = true;
	for (const alg of ["blake3", "sha256"] as const) {
		try {
			createHash(alg).update("").digest();
			supported[alg] = true;
		} catch {
			supported[alg] = false;
		}
	}
	return supported;
}

/**
 * Resolve a preferred algorithm to one the runtime actually supports.
 * Defaults to sha256 when blake3 is unavailable — the resulting
 * `contentId` is still content-addressed, just on a different hash.
 */
export function resolveHashAlgorithm(
	preferred: ContentHashAlgorithm = MANIFEST_HASH_ALGORITHM,
): ContentHashAlgorithm {
	const support = probeAlgorithms();
	if (support[preferred]) return preferred;
	if (support.sha256) return "sha256";
	throw new Error(
		"resolveHashAlgorithm: neither blake3 nor sha256 is supported by this Node build",
	);
}

/**
 * Canonical JSON for signing/hashing: object keys sorted recursively, no
 * whitespace. Stable across platforms and language runtimes.
 */
export function canonicalJson(value: unknown): string {
	return canonicalize(value);
}

function canonicalize(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error("canonicalJson: non-finite number");
		}
		return JSON.stringify(value);
	}
	if (typeof value === "string") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((v) => canonicalize(v)).join(",")}]`;
	}
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const keys = Object.keys(obj).sort();
		const parts: string[] = [];
		for (const k of keys) {
			const v = obj[k];
			if (v === undefined) continue; // drop undefined entries
			parts.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
		}
		return `{${parts.join(",")}}`;
	}
	throw new Error(`canonicalJson: unsupported type ${typeof value}`);
}

/**
 * Bytes-of-the-manifest-for-signing. Two fields are stripped:
 *
 *   - `signature` — it cannot be part of its own signature.
 *   - `contentId` — it is *derived* from the canonical body. Including it
 *     would create a self-reference (chicken-and-egg) the moment a builder
 *     writes a placeholder value before computing the hash.
 *
 * The verifier strips the same two fields, which is what makes
 * `contentId` a pure function of the manifest body.
 */
export function canonicalManifestBytes(manifest: ModelManifest): Uint8Array {
	const { signature: _sig, contentId: _cid, ...withoutDerived } = manifest;
	return new TextEncoder().encode(canonicalJson(withoutDerived));
}

/**
 * Compute a hex hash over the canonical manifest body.
 *
 * Defaults to BLAKE3 (noema-atlas / zest terminology). When BLAKE3 is not
 * available in the runtime we fall back to SHA-256 — `node:crypto` always
 * has SHA-256 and the resulting `contentId` is still content-addressed.
 */
export function hashManifest(
	manifest: ModelManifest,
	algorithm?: ContentHashAlgorithm,
): string {
	const algo = algorithm ?? resolveHashAlgorithm();
	const bytes = canonicalManifestBytes(manifest);
	const digest = createHash(algo).update(bytes).digest("hex");
	return `${algo}:${digest}`;
}

export interface ManifestBuilderInput {
	id: string;
	name: string;
	description?: string;
	license?: string;
	quantization?: string;
	sizeBytes: number;
	sources: ManifestSource[];
	hashes: ContentHashes;
	createdAt?: string;
}

/**
 * Construct a manifest with a freshly-computed `contentId`. `signature` is
 * left undefined; signing is a separate step (`signManifest`).
 */
export function buildManifest(input: ManifestBuilderInput): ModelManifest {
	if (input.id.length === 0) throw new Error("buildManifest: id is required");
	if (input.sizeBytes <= 0) throw new Error("buildManifest: sizeBytes must be positive");
	if (input.sources.length === 0) throw new Error("buildManifest: at least one source is required");
	if (!input.hashes.blake3 && !input.hashes.sha256) {
		throw new Error("buildManifest: hashes must include at least blake3 or sha256");
	}
	const manifest: ModelManifest = {
		id: input.id,
		name: input.name,
		sizeBytes: input.sizeBytes,
		contentId: "", // placeholder; set by recomputeContentId below
		hashes: input.hashes,
		sources: input.sources,
		createdAt: input.createdAt ?? new Date().toISOString(),
		...(input.description !== undefined ? { description: input.description } : {}),
		...(input.license !== undefined ? { license: input.license } : {}),
		...(input.quantization !== undefined ? { quantization: input.quantization } : {}),
	};
	return recomputeContentId(manifest);
}

/**
 * Re-derive `contentId` after a manifest was modified (e.g. sources added).
 * In-place mutation is intentional — keeps the same object identity for
 * downstream callers holding a reference.
 */
export function recomputeContentId(manifest: ModelManifest): ModelManifest {
	manifest.contentId = hashManifest(manifest);
	return manifest;
}

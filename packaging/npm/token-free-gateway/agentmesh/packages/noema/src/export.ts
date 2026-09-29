/**
 * P2P envelope for manifests.
 *
 * When `packages/bitterbot` beacons a model on the mesh (Phase B2), the
 * payload it publishes on the Gossipsub topic
 * `agentmesh/models/<model-id>` is a `ManifestEnvelope`, not a raw
 * `ModelManifest`. The envelope adds:
 *
 *   - `schema`         — version tag so we can roll the format
 *   - `publisher`      — peer id of the publisher (matches peer-mesh
 *                        identity so receivers can verify the signature)
 *   - `publishedAt`    — unix ms timestamp for staleness / re-announce
 *   - `signature`      — Ed25519 over canonical manifest body
 *   - `manifest`       — the manifest itself
 *
 * Encoding is JSON (not protobuf) to keep the wire debuggable with `tail`
 * and to match the rest of the agentmesh packages' style. We compute
 * `envelopeId = blake3:canonicalJson({schema, publisher, publishedAt, manifest})`
 * so duplicate gossip messages collapse into a single one.
 */

import { createHash } from "node:crypto";
import { canonicalJson, resolveHashAlgorithm } from "./manifest.js";
import type { ModelManifest } from "./types.js";
import { signManifest, verifyManifest } from "./verify.js";

export const ENVELOPE_SCHEMA = "agentmesh.model-manifest/envelope.v1" as const;
export const ENVELOPE_TOPIC_PREFIX = "agentmesh/models/" as const;

export function envelopeTopic(manifestId: string): string {
	return `${ENVELOPE_TOPIC_PREFIX}${manifestId}`;
}

export interface ManifestEnvelope {
	schema: typeof ENVELOPE_SCHEMA;
	publisher: string;
	publishedAt: number;
	signature?: string;
	manifest: ModelManifest;
}

/**
 * Build an envelope from a manifest. The manifest must already be signed
 * (or `signer` is provided here — convenience path).
 */
export function buildEnvelope(
	manifest: ModelManifest,
	publisher: string,
	options: { signer?: { sign(bytes: Uint8Array): string } } = {},
): ManifestEnvelope {
	const signed = options.signer ? signManifest(manifest, options.signer) : manifest;
	return {
		schema: ENVELOPE_SCHEMA,
		publisher,
		publishedAt: Date.now(),
		...(signed.signature ? { signature: signed.signature } : {}),
		manifest: signed,
	};
}

/**
 * Stable id for deduplication. Two envelopes with the same id represent
 * the same publication and can be collapsed by the gossip layer.
 *
 * Runtime-aware: prefers BLAKE3 but falls back to SHA-256 when the
 * underlying OpenSSL build does not advertise BLAKE3.
 */
export function envelopeId(envelope: ManifestEnvelope): string {
	const canonical = canonicalJson({
		schema: envelope.schema,
		publisher: envelope.publisher,
		publishedAt: envelope.publishedAt,
		manifest: envelope.manifest,
	});
	const algo = resolveHashAlgorithm();
	return `${algo}:${createHash(algo).update(canonical).digest("hex")}`;
}

/**
 * Verify a parsed envelope. Returns the same shape as `verifyManifest`,
 * plus a separate field for an unknown schema.
 */
export function verifyEnvelope(
	envelope: unknown,
): { ok: true; envelope: ManifestEnvelope } | { ok: false; reason: string } {
	if (!envelope || typeof envelope !== "object")
		return { ok: false, reason: "envelope must be an object" };
	const e = envelope as Record<string, unknown>;
	if (e.schema !== ENVELOPE_SCHEMA) {
		return { ok: false, reason: `unsupported schema: ${String(e.schema)}` };
	}
	if (typeof e.publisher !== "string" || e.publisher.length === 0) {
		return { ok: false, reason: "publisher must be non-empty string" };
	}
	if (typeof e.publishedAt !== "number" || e.publishedAt <= 0) {
		return { ok: false, reason: "publishedAt must be a positive unix ms" };
	}
	if (!e.manifest || typeof e.manifest !== "object") {
		return { ok: false, reason: "manifest is required" };
	}
	const result = verifyManifest(e.manifest);
	if (!result.ok) {
		return { ok: false, reason: result.failures.map((f) => `${f.field}: ${f.reason}`).join("; ") };
	}
	return { ok: true, envelope: envelope as ManifestEnvelope };
}

export function encodeEnvelope(envelope: ManifestEnvelope): string {
	return JSON.stringify(envelope);
}

export function decodeEnvelope(
	json: string,
): { ok: true; envelope: ManifestEnvelope } | { ok: false; reason: string } {
	try {
		const parsed = JSON.parse(json);
		return verifyEnvelope(parsed);
	} catch (e) {
		return { ok: false, reason: `json parse: ${(e as Error).message}` };
	}
}

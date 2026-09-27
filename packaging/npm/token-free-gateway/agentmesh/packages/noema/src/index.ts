export { NoemaClient } from "./client.js";
export type {
	BroadcastRequest,
	ContentHashAlgorithm,
	ContentHashes,
	DownloadRequest,
	DownloadStatus,
	ManifestSource,
	ModelManifest,
	ModelSearchRequest,
	ModelSearchResult,
} from "./types.js";

// Phase B1 — in-process manifest construction, verification, and P2P
// envelope. Lives alongside `client.ts` (which shells out to the
// upstream noema CLI); the two are complementary, not duplicates.
export {
	MANIFEST_HASH_ALGORITHM,
	buildManifest,
	canonicalJson,
	canonicalManifestBytes,
	hashManifest,
	recomputeContentId,
	resolveHashAlgorithm,
} from "./manifest.js";
export type { ManifestBuilderInput } from "./manifest.js";

export {
	signManifest,
	verifyFile,
	verifyManifest,
	verifyStream,
} from "./verify.js";
export type { Signer, VerificationFailure, VerificationResult } from "./verify.js";

export {
	ENVELOPE_SCHEMA,
	ENVELOPE_TOPIC_PREFIX,
	buildEnvelope,
	decodeEnvelope,
	encodeEnvelope,
	envelopeId,
	envelopeTopic,
	verifyEnvelope,
} from "./export.js";
export type { ManifestEnvelope } from "./export.js";

// Mesh source abstraction, source resolver, and verified download
export {
	DEFAULT_PIECE_SIZE,
	MESH_DOWNLOAD_PROTOCOL,
	fetchFromMeshSource,
} from "./mesh-source.js";
export type {
	MeshPeerConnection,
	MeshSourceOptions,
	MeshSourceRef,
} from "./mesh-source.js";

export { orderSources, resolveSource } from "./source-resolver.js";
export type { ResolvedSourceResult, SourceResolverOptions } from "./source-resolver.js";

export { downloadFromManifest } from "./download.js";
export type { DownloadOptions } from "./download.js";


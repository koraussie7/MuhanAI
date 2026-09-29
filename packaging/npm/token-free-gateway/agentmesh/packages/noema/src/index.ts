export { NoemaClient } from "./client.js";
export type { DownloadOptions } from "./download.js";
export { downloadFromManifest } from "./download.js";
export type { ManifestEnvelope } from "./export.js";
export {
	buildEnvelope,
	decodeEnvelope,
	ENVELOPE_SCHEMA,
	ENVELOPE_TOPIC_PREFIX,
	encodeEnvelope,
	envelopeId,
	envelopeTopic,
	verifyEnvelope,
} from "./export.js";
export type { ManifestBuilderInput } from "./manifest.js";
// Phase B1 — in-process manifest construction, verification, and P2P
// envelope. Lives alongside `client.ts` (which shells out to the
// upstream noema CLI); the two are complementary, not duplicates.
export {
	buildManifest,
	canonicalJson,
	canonicalManifestBytes,
	hashManifest,
	MANIFEST_HASH_ALGORITHM,
	recomputeContentId,
	resolveHashAlgorithm,
} from "./manifest.js";
export type {
	MeshPeerConnection,
	MeshSourceOptions,
	MeshSourceRef,
} from "./mesh-source.js";

// Mesh source abstraction, source resolver, and verified download
export {
	DEFAULT_PIECE_SIZE,
	fetchFromMeshSource,
	MESH_DOWNLOAD_PROTOCOL,
} from "./mesh-source.js";
export type { ResolvedSourceResult, SourceResolverOptions } from "./source-resolver.js";

export { orderSources, resolveSource } from "./source-resolver.js";
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
export type { Signer, VerificationFailure, VerificationResult } from "./verify.js";
export {
	signManifest,
	verifyFile,
	verifyManifest,
	verifyStream,
} from "./verify.js";

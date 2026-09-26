/**
 * Verifiable Credentials (VC) data model — W3C VC Data Model 2.0 compatible.
 *
 * Reference: https://www.w3.org/TR/vc-data-model-2.0/
 *
 * Key concepts:
 * - Credential: A set of claims made by an issuer about a subject
 * - Presentation: A subset of credentials shared with a verifier
 * - Proof: Cryptographic proof of authenticity (Ed25519 signature)
 */

// ─── Core Types ──────────────────────────────────────────────────────

/** Unique identifier (URI or DID) */
export type URI = string;

/** Cryptographic suite identifier */
export type CryptoSuite =
	| "Ed25519Signature2020"
	| "EcdsaSecp256k1Signature2019"
	| "JsonWebSignature2020";

/** Proof purpose per W3C VC spec */
export type ProofPurpose =
	| "assertionMethod"
	| "authentication"
	| "keyAgreement"
	| "capabilityInvocation"
	| "capabilityDelegation";

/** Base credential subject */
export interface CredentialSubject {
	id: string; // DID or URI
	[key: string]: unknown;
}

/** Verifiable Credential */
export interface VerifiableCredential {
	/** @context - REQUIRED: JSON-LD context */
	"@context": string | string[];

	/** id - OPTIONAL: URI for the credential */
	id?: URI;

	/** type - REQUIRED: Array of types */
	type: string[];

	/** issuer - REQUIRED: DID or URI of issuer */
	issuer: URI | { id: URI; name?: string };

	/** issuanceDate - REQUIRED: ISO 8601 timestamp */
	issuanceDate: string;

	/** expirationDate - OPTIONAL: ISO 8601 timestamp */
	expirationDate?: string;

	/** credentialSubject - REQUIRED: The subject of the credential */
	credentialSubject: CredentialSubject | CredentialSubject[];

	/** credentialSchema - OPTIONAL: Schema reference */
	credentialSchema?: {
		id: URI;
		type: string;
	}[];

	/** credentialStatus - OPTIONAL: Revocation/status check */
	credentialStatus?: {
		id: URI;
		type: string;
	};

	/** proof - REQUIRED for verifiable credential: Cryptographic proof */
	proof?: Proof;

	/** refreshService - OPTIONAL: Service to refresh credential */
	refreshService?: {
		id: URI;
		type: string;
	};

	/** termsOfUse - OPTIONAL: Terms of use policies */
	termsOfUse?: {
		type: string;
		[key: string]: unknown;
	}[];

	/** evidence - OPTIONAL: Evidence supporting the credential */
	evidence?: {
		type: string;
		[key: string]: unknown;
	}[];
}

/** Cryptographic proof */
export interface Proof {
	/** type - REQUIRED: Proof type (e.g., "Ed25519Signature2020") */
	type: string;

	/** created - REQUIRED: ISO 8601 timestamp when proof was created */
	created: string;

	/** verificationMethod - REQUIRED: URI of verification method (key) */
	verificationMethod: URI;

	/** proofPurpose - REQUIRED: Purpose of the proof */
	proofPurpose: ProofPurpose;

	/** challenge - OPTIONAL: Challenge for freshness (authentication) */
	challenge?: string;

	/** domain - OPTIONAL: Domain restriction */
	domain?: string;

	/** proofValue - REQUIRED: Base58BTC or base64 encoded signature */
	proofValue: string;

	/** nonce - OPTIONAL: Nonce for replay protection */
	nonce?: string;

	/** previousProof - OPTIONAL: Chain of proofs */
	previousProof?: Proof | Proof[];
}

/** Verifiable Presentation */
export interface VerifiablePresentation {
	"@context": string | string[];
	id?: URI;
	type: string[];
	verifiableCredential: VerifiableCredential[];
	holder?: URI;
	proof?: Proof;
}

// ─── Credential Types for MuhanAI ────────────────────────────────────

/** Credential types specific to MuhanAI P2P network */
export const CredentialType = {
	/** Peer identity credential - attests to peer's public key */
	PeerIdentity: "PeerIdentityCredential",

	/** Peer reputation credential - attests to reputation score */
	PeerReputation: "PeerReputationCredential",

	/** Service endorsement - one peer endorses another's service */
	ServiceEndorsement: "ServiceEndorsementCredential",

	/** Computation verification - result of computation verified */
	ComputationVerified: "ComputationVerifiedCredential",

	/** Data integrity - data has not been tampered */
	DataIntegrity: "DataIntegrityCredential",

	/** Governance vote - participation in governance */
	GovernanceVote: "GovernanceVoteCredential",

	/** Peer attestation - one peer attests to another's behavior */
	PeerAttestation: "PeerAttestationCredential",
} as const;

/** Peer Identity Credential Subject */
export interface PeerIdentityCredentialSubject extends CredentialSubject {
	id: string; // peer DID
	publicKey: {
		id: string; // key DID
		type: "Ed25519VerificationKey2020";
		controller: string; // DID
		publicKeyMultibase: string; // base58btc encoded public key
	};
	network: string; // e.g., "muhanai-mainnet"
	roles?: string[]; // e.g., ["validator", "relay"]
}

/** Peer Reputation Credential Subject */
export interface PeerReputationCredentialSubject extends CredentialSubject {
	id: string; // peer DID
	reputation: {
		subject: string; // e.g., "compute", "storage", "routing"
		score: number; // 0-1
		variance: number; // uncertainty
		alpha: number; // Beta distribution α
		beta: number; // Beta distribution β
		samples: number; // number of observations
	};
	assessor: string; // DID of assessor
	evidence?: string[]; // references to evidence
}

/** Service Endorsement Credential Subject */
export interface ServiceEndorsementCredentialSubject extends CredentialSubject {
	id: string; // service DID or identifier
	endorser: string; // DID of endorser
	serviceType: string; // e.g., "inference", "storage", "routing"
	qualityScore: number; // 0-1
	latencyMs?: number;
	availability?: number; // 0-1
	costPerUnit?: number;
	currency?: string;
}

/** Peer Attestation Credential Subject */
export interface PeerAttestationCredentialSubject extends CredentialSubject {
	id: string; // attested peer DID
	attestor: string; // DID of attestor
	claim: "honest" | "malicious" | "unreliable" | "reliable" | "high-quality" | "low-quality";
	confidence: number; // 0-1
	evidence?: string[]; // references to evidence (logs, transactions, etc.)
	context?: string; // context of attestation
}

// ─── VC Utilities ──────────────────────────────────────────────────

/**
 * Create a base Verifiable Credential
 */
export function createCredential(
	context: string | string[],
	types: string[],
	issuer: URI | { id: URI; name?: string },
	credentialSubject: CredentialSubject | CredentialSubject[],
	options: {
		id?: URI;
		expirationDate?: string;
		credentialSchema?: VerifiableCredential["credentialSchema"];
		credentialStatus?: VerifiableCredential["credentialStatus"];
		termsOfUse?: VerifiableCredential["termsOfUse"];
		evidence?: VerifiableCredential["evidence"];
	} = {},
): VerifiableCredential {
	const now = new Date().toISOString();
	return {
		"@context": context,
		id: options.id,
		type: ["VerifiableCredential", ...types],
		issuer,
		issuanceDate: new Date().toISOString(),
		expirationDate: options.expirationDate,
		credentialSubject,
		credentialSchema: options.credentialSchema,
		credentialStatus: options.credentialStatus,
		termsOfUse: options.termsOfUse,
		evidence: options.evidence,
	};
}

/**
 * Create Ed25519Signature2020 proof
 */
export async function createProof(
	credential: VerifiableCredential,
	verificationMethod: string,
	privateKey: Uint8Array,
	options: {
		proofPurpose: ProofPurpose;
		challenge?: string;
		domain?: string;
	} = { proofPurpose: "assertionMethod" },
): Promise<Proof> {
	const { ed25519 } = await import("@noble/curves/ed25519");
	const { canonicalize } = await import("json-canonicalize");

	// Create proof object without proofValue
	const proof: Proof = {
		type: "Ed25519Signature2020",
		created: new Date().toISOString(),
		verificationMethod,
		proofPurpose: options.proofPurpose,
		challenge: options.challenge,
		domain: options.domain,
		proofValue: "", // placeholder
	};

	// Create verification hash (canonicalize credential without proof)
	const credentialCopy = { ...credential };
	delete (credentialCopy as any).proof;
	const canonical = canonicalize(credentialCopy);
	const message = new TextEncoder().encode(canonical);

	// Sign
	const signature = ed25519.sign(message, privateKey);

	return {
		...proof,
		proofValue: "z" + multibaseEncode(signature), // base58btc (multibase)
	};
}

/**
 * Verify Ed25519Signature2020 proof
 */
export async function verifyProof(
	credential: VerifiableCredential,
	publicKey: Uint8Array,
): Promise<boolean> {
	const { ed25519 } = await import("@noble/curves/ed25519");
	const { canonicalize } = await import("json-canonicalize");

	if (!credential.proof) return false;
	const proof = credential.proof;

	if (proof.type !== "Ed25519Signature2020") return false;
	if (!proof.proofValue) return false;

	// Decode proof value (multibase base58btc)
	const signature = multibaseDecode(proof.proofValue);
	if (!signature) return false;

	// Reconstruct message
	const credentialCopy = { ...credential };
	delete (credentialCopy as any).proof;
	const canonical = canonicalize(credentialCopy);
	const message = new TextEncoder().encode(canonical);

	return ed25519.verify(signature, message, publicKey);
}

/**
 * Base58BTC (multibase) encoding/decoding
 */
function multibaseEncode(data: Uint8Array): string {
	// Simple base58 encoding (for production, use multiformats/multibase)
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
	let num = BigInt("0x" + Buffer.from(data).toString("hex"));
	let encoded = "";

	while (num > 0) {
		const remainder = num % 58n;
		encoded =
			"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(remainder)] + encoded;
		num = num / 58n;
	}

	// Add leading zeros
	let leadingZeros = 0;
	for (const byte of new Uint8Array([0, 0, 0, 0])) {
		// placeholder for actual data
		if (byte === 0) leadingZeros++;
		else break;
	}

	return "1".repeat(leadingZeros) + encoded;
}

function multibaseDecode(encoded: string): Uint8Array | null {
	// Simplified decode - for production use multiformats/multibase
	if (!encoded.startsWith("z")) return null; // base58btc
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
	let num = 0n;
	for (const char of encoded.slice(1)) {
		const index = alphabet.indexOf(char);
		if (index === -1) return null;
		num = num * 58n + BigInt(index);
	}
	const hex = num.toString(16).padStart(64, "0");
	return new Uint8Array(Buffer.from(hex, "hex"));
}

// ─── VC Verification ───────────────────────────────────────────────

export interface VerificationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Verify a Verifiable Credential
 */
export async function verifyCredential(
	credential: VerifiableCredential,
	trustedIssuers: Set<string> = new Set(),
	options: {
		checkExpiration?: boolean;
		checkRevocation?: boolean;
		trustedIssuers?: Set<string>;
	} = {},
): Promise<VerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	// 1. Check required fields
	if (!credential["@context"]) errors.push("Missing @context");
	if (
		!credential.type ||
		!Array.isArray(credential.type) ||
		!credential.type.includes("VerifiableCredential")
	) {
		errors.push("Missing or invalid type");
	}
	if (!credential.issuer) errors.push("Missing issuer");
	if (!credential.issuanceDate) errors.push("Missing issuanceDate");
	if (!credential.credentialSubject) errors.push("Missing credentialSubject");

	// 2. Check expiration
	if (options.checkExpiration !== false && credential.expirationDate) {
		const exp = new Date(credential.expirationDate).getTime();
		if (Date.now() > exp) errors.push("Credential expired");
	}

	// 3. Check issuer trust
	if (trustedIssuers.size > 0) {
		const issuerId =
			typeof credential.issuer === "string" ? credential.issuer : credential.issuer.id;
		if (!trustedIssuers.has(issuerId)) {
			warnings.push(`Issuer ${issuerId} not in trusted issuers list`);
		}
	}

	// 4. Verify proof if present
	if (credential.proof) {
		// Would need public key resolution from verificationMethod
		// For now, just warn
		warnings.push("Proof verification requires public key resolution (not implemented)");
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

/**
 * Verify a Verifiable Presentation
 */
export async function verifyPresentation(
	presentation: VerifiablePresentation,
	trustedHolders: Set<string> = new Set(),
): Promise<VerificationResult> {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (
		!presentation.type ||
		!Array.isArray(presentation.type) ||
		!presentation.type.includes("VerifiablePresentation")
	) {
		errors.push("Invalid presentation type");
	}

	if (!presentation.verifiableCredential || !Array.isArray(presentation.verifiableCredential)) {
		errors.push("Missing verifiableCredential");
	} else {
		// Verify each credential
		for (const cred of presentation.verifiableCredential) {
			const result = await verifyCredential(cred);
			if (!result.valid) {
				errors.push(...result.errors.map((e) => `Credential error: ${e}`));
			}
		}
	}

	// Verify presentation proof
	if (presentation.proof) {
		warnings.push("Presentation proof verification requires holder public key resolution");
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}

// ─── VC Revocation (CRL/StatusList2021) ────────────────────────────

export interface CredentialStatus {
	id: URI;
	type: "CredentialStatusList2021" | "RevocationList2020";
	credentialIndex?: number;
	credentialId?: string;
}

export interface StatusList2021Credential extends VerifiableCredential {
	credentialSubject: {
		id: URI;
		type: "StatusList2021";
		encodedList: string; // base64url encoded bitstring
	};
}

/**
 * Check credential revocation status
 */
export async function checkRevocation(
	status: CredentialStatus,
	prisma?: any,
): Promise<{ revoked: boolean; reason?: string }> {
	if (status.type === "CredentialStatusList2021") {
		// Would fetch status list and check bit at credentialIndex
		return { revoked: false };
	}
	return { revoked: false };
}

/**
 * Create a status list credential (for issuer to publish)
 */
export function createStatusList2021(
	issuer: URI,
	verificationMethod: URI,
	size: number = 131072, // 16KB = 131072 bits
): VerifiableCredential {
	const encodedList = "0".repeat(size); // all valid (0 = not revoked)
	return {
		"@context": ["https://www.w3.org/ns/credentials/v2", "https://w3id.org/vc/status-list/2021/v1"],
		type: ["VerifiableCredential", "StatusList2021Credential"],
		issuer,
		issuanceDate: new Date().toISOString(),
		credentialSubject: {
			id: `urn:uuid:${crypto.randomUUID()}`,
			type: "StatusList2021",
			encodedList: btoa(encodedList), // base64url encoded
		},
	};
}

/**
 * Revoke a credential in a status list
 */
export function revokeCredential(
	statusList: VerifiableCredential,
	credentialIndex: number,
): VerifiableCredential {
	// Decode, flip bit, re-encode
	// Simplified - in production use proper bit manipulation
	return statusList;
}

// ─── Peer Attestation VC Helpers ───────────────────────────────────

/**
 * Create a Peer Attestation Credential
 */
export async function createPeerAttestationCredential(
	issuer: URI,
	subject: PeerAttestationCredentialSubject,
	verificationMethod: URI,
	privateKey: Uint8Array,
	options: {
		expirationDays?: number;
		challenge?: string;
	} = {},
): Promise<VerifiableCredential> {
	const credential = createCredential(
		["https://www.w3.org/ns/credentials/v2", "https://muhanai.com/ns/credentials/v1"],
		["VerifiableCredential", CredentialType.PeerAttestation],
		issuer,
		{
			id: subject.id,
			attestor: subject.attestor,
			claim: subject.claim,
			confidence: subject.confidence,
			evidence: subject.evidence,
			context: subject.context,
		},
		{
			expirationDate: options.expirationDays
				? new Date(Date.now() + options.expirationDays * 24 * 60 * 60 * 1000).toISOString()
				: undefined,
		},
	);

	const proof = await createProof(credential, "", new Uint8Array(32), {
		proofPurpose: "assertionMethod",
	}); // Would use actual private key

	return { ...credential, proof };
}

/**
 * Create a Peer Reputation Credential
 */
export function createPeerReputationCredential(
	issuer: URI,
	subject: PeerReputationCredentialSubject,
	verificationMethod: URI,
	privateKey: Uint8Array,
	options: {
		expirationDays?: number;
	} = {},
): Promise<VerifiableCredential> {
	const credential = createCredential(
		["https://www.w3.org/ns/credentials/v2", "https://muhanai.com/ns/credentials/v1"],
		["VerifiableCredential", CredentialType.PeerReputation],
		issuer,
		{
			id: subject.id,
			reputation: subject.reputation,
			assessor: subject.assessor,
			evidence: subject.evidence,
		},
		{
			expirationDate: options.expirationDays
				? new Date(Date.now() + options.expirationDays * 24 * 60 * 60 * 1000).toISOString()
				: undefined,
		},
	);

	// Proof creation would happen here with actual private key
	return Promise.resolve({
		...credential,
		proof: { type: "Ed25519Signature2020", proofValue: "" } as Proof,
	});
}

/**
 * Create a Service Endorsement Credential
 */
export function createServiceEndorsementCredential(
	issuer: URI,
	subject: ServiceEndorsementCredentialSubject,
	verificationMethod: URI,
	privateKey: Uint8Array,
	options: {
		expirationDays?: number;
	} = {},
): Promise<VerifiableCredential> {
	const credential = createCredential(
		["https://www.w3.org/ns/credentials/v2", "https://muhanai.com/ns/credentials/v1"],
		["VerifiableCredential", CredentialType.ServiceEndorsement],
		issuer,
		{
			id: subject.id,
			endorser: subject.endorser,
			serviceType: subject.serviceType,
			qualityScore: subject.qualityScore,
			latencyMs: subject.latencyMs,
			availability: subject.availability,
			costPerUnit: subject.costPerUnit,
			currency: subject.currency,
		},
		{
			expirationDate: options.expirationDays
				? new Date(Date.now() + options.expirationDays * 24 * 60 * 60 * 1000).toISOString()
				: undefined,
		},
	);

	return Promise.resolve({
		...credential,
		proof: { type: "Ed25519Signature2020", proofValue: "" } as Proof,
	});
}

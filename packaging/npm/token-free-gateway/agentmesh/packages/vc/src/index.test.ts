import { describe, expect, it, vi } from "vitest";
import {
	CredentialType,
	createCredential,
	createPeerAttestationCredential,
	createPeerReputationCredential,
	createServiceEndorsementCredential,
	verifyCredential,
	verifyCredential as verifyCredentialFn,
	verifyPresentation,
} from "./index.js";

describe("VC Core", () => {
	it("creates a basic Verifiable Credential", () => {
		const cred = createCredential(
			["https://www.w3.org/ns/credentials/v2"],
			["TestCredential"],
			"did:example:issuer",
			{ id: "did:example:subject", name: "Test Subject" },
		);

		expect(cred["@context"]).toEqual(["https://www.w3.org/ns/credentials/v2"]);
		expect(cred.type).toEqual(["VerifiableCredential", "TestCredential"]);
		expect(cred.issuer).toBe("did:example:issuer");
		expect(cred.credentialSubject).toEqual({ id: "did:example:subject", name: "Test Subject" });
		expect(cred.issuanceDate).toBeDefined();
	});

	it("includes optional fields when provided", () => {
		const cred = createCredential(
			["https://www.w3.org/ns/credentials/v2"],
			["TestCredential"],
			"did:example:issuer",
			{ id: "did:example:subject" },
			{
				id: "urn:uuid:test",
				expirationDate: "2025-12-31T23:59:59Z",
			},
		);

		expect(cred.id).toBe("urn:uuid:test");
		expect(cred.expirationDate).toBe("2025-12-31T23:59:59Z");
	});
});

describe("Credential Types", () => {
	it("has all required credential types", () => {
		expect(CredentialType.PeerIdentity).toBe("PeerIdentityCredential");
		expect(CredentialType.PeerReputation).toBe("PeerReputationCredential");
		expect(CredentialType.ServiceEndorsement).toBe("ServiceEndorsementCredential");
		expect(CredentialType.PeerAttestation).toBe("PeerAttestationCredential");
		expect(CredentialType.ComputationVerified).toBe("ComputationVerifiedCredential");
		expect(CredentialType.DataIntegrity).toBe("DataIntegrityCredential");
		expect(CredentialType.GovernanceVote).toBe("GovernanceVoteCredential");
	});
});

describe("verifyCredential", () => {
	it("validates required fields", async () => {
		const cred = {
			"@context": ["https://www.w3.org/ns/credentials/v2"],
			type: ["VerifiableCredential", "TestCredential"],
			issuer: "did:example:issuer",
			issuanceDate: new Date().toISOString(),
			credentialSubject: { id: "did:example:subject" },
		} as any;

		const result = await verifyCredential(cred);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	it("rejects missing @context", async () => {
		const cred = {
			type: ["VerifiableCredential", "TestCredential"],
			issuer: "did:example:issuer",
			issuanceDate: new Date().toISOString(),
			credentialSubject: { id: "did:example:subject" },
		} as any;

		const result = await verifyCredential(cred);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Missing @context");
	});

	it("rejects missing issuer", async () => {
		const cred = {
			"@context": ["https://www.w3.org/ns/credentials/v2"],
			type: ["VerifiableCredential", "TestCredential"],
			issuanceDate: new Date().toISOString(),
			credentialSubject: { id: "did:example:subject" },
		} as any;

		const result = await verifyCredential(cred);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Missing issuer");
	});

	it("detects expired credentials", async () => {
		const cred = {
			"@context": ["https://www.w3.org/ns/credentials/v2"],
			type: ["VerifiableCredential", "TestCredential"],
			issuer: "did:example:issuer",
			issuanceDate: "2020-01-01T00:00:00Z",
			expirationDate: "2021-01-01T00:00:00Z",
			credentialSubject: { id: "did:example:subject" },
		} as any;

		const result = await verifyCredential(cred, new Set(), { checkExpiration: true });
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Credential expired");
	});

	it("accepts non-expired credentials", async () => {
		const future = new Date(Date.now() + 86400000).toISOString();
		const cred = {
			"@context": ["https://www.w3.org/ns/credentials/v2"],
			type: ["VerifiableCredential", "TestCredential"],
			issuer: "did:example:issuer",
			issuanceDate: new Date().toISOString(),
			expirationDate: future,
			credentialSubject: { id: "did:example:subject" },
		} as any;

		const result = await verifyCredential(cred, new Set(), { checkExpiration: true });
		expect(result.valid).toBe(true);
	});
});

describe("verifyPresentation", () => {
	it("validates presentation structure", async () => {
		const pres = {
			"@context": ["https://www.w3.org/ns/credentials/v2"],
			type: ["VerifiablePresentation"],
			verifiableCredential: [
				{
					"@context": ["https://www.w3.org/ns/credentials/v2"],
					type: ["VerifiableCredential", "TestCredential"],
					issuer: "did:example:issuer",
					issuanceDate: new Date().toISOString(),
					credentialSubject: { id: "did:example:subject" },
				},
			],
		} as any;

		const result = await verifyPresentation(pres);
		expect(result.valid).toBe(true);
	});

	it("rejects invalid presentation type", async () => {
		const pres = {
			type: ["InvalidPresentation"],
			verifiableCredential: [],
		} as any;

		const result = await verifyPresentation(pres);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Invalid presentation type");
	});

	it("rejects missing verifiableCredential", async () => {
		const pres = {
			type: ["VerifiablePresentation"],
		} as any;

		const result = await verifyPresentation(pres);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Missing verifiableCredential");
	});
});

describe("CredentialType constants", () => {
	it("exports all expected types", () => {
		expect(CredentialType.PeerIdentity).toBe("PeerIdentityCredential");
		expect(CredentialType.PeerReputation).toBe("PeerReputationCredential");
		expect(CredentialType.ServiceEndorsement).toBe("ServiceEndorsementCredential");
		expect(CredentialType.PeerAttestation).toBe("PeerAttestationCredential");
		expect(CredentialType.ComputationVerified).toBe("ComputationVerifiedCredential");
		expect(CredentialType.DataIntegrity).toBe("DataIntegrityCredential");
		expect(CredentialType.GovernanceVote).toBe("GovernanceVoteCredential");
	});
});

import { describe, expect, it } from "vitest";
import {
	agentCardToDescriptor,
	capabilityNames,
	capabilityTitle,
	capabilityToAgentCapability,
	inferAgentType,
	isMoltmeshDid,
} from "./mapper.ts";
import type { AgentCard } from "./types.ts";

const EMPTY_BYTES = new Uint8Array();

function skill(id: string) {
	return {
		id,
		name: id,
		description: "",
		inputSchema: EMPTY_BYTES,
		outputSchema: EMPTY_BYTES,
		tags: [],
	};
}

const CARD: AgentCard = {
	did: "did:key:z6MkTestAgent",
	name: "Swift Falcon",
	description: "research agent",
	skills: [skill("a2a:v1:cap:code-review"), skill("a2a:v1:cap:web-search")],
	multiaddrs: [],
	publicKey: "abc",
	publishedAt: "0",
	expiresAt: "9999999999999",
	signature: "sig",
	metadata: {},
	encryptionPublicKey: EMPTY_BYTES,
	nodePeerId: "12D3Koo",
	sequence: "1",
};

describe("capability mapping", () => {
	it("strips the a2a:v1:cap: prefix", () => {
		expect(capabilityNames(CARD)).toEqual(["code-review", "web-search"]);
	});

	it("maps recognised words onto the AgentCapability vocabulary", () => {
		expect(capabilityToAgentCapability("answer")).toBe("answer");
		expect(capabilityToAgentCapability("verify-tasks")).toBe("verify");
		expect(capabilityToAgentCapability("teach")).toBe("teach");
		expect(capabilityToAgentCapability("local-knowledge")).toBe("local_knowledge");
		// Unknown names pass through rather than being dropped.
		expect(capabilityToAgentCapability("some-exotic-cap")).toBe("some-exotic-cap");
	});

	it("renders capability titles without hyphens", () => {
		expect(capabilityTitle("a2a:v1:cap:code-review")).toBe("code review");
		expect(capabilityTitle("text-generation")).toBe("text generation");
	});
});

describe("agent card → descriptor", () => {
	it("keeps the DID in the id and prefers the card name", () => {
		const descriptor = agentCardToDescriptor(CARD);
		expect(descriptor.id).toBe("moltmesh:did:key:z6MkTestAgent");
		expect(descriptor.name).toBe("Swift Falcon");
	});

	it("infers the network role from capabilities", () => {
		expect(inferAgentType(CARD)).toBe("search");
		const plain: AgentCard = { ...CARD, skills: [skill("a2a:v1:cap:text-generation")] };
		expect(inferAgentType(plain)).toBe("llm");
	});

	it("treats an unexpired card as online", () => {
		const descriptor = agentCardToDescriptor(CARD, { now: 1_000_000 });
		expect(descriptor.health?.online).toBe(true);
	});

	it("treats an expired card as offline (publisher stopped refreshing)", () => {
		const expired: AgentCard = { ...CARD, expiresAt: "500000" };
		const descriptor = agentCardToDescriptor(expired, { now: 1_000_000 });
		expect(descriptor.health?.online).toBe(false);
	});

	it("honours the explicit online override", () => {
		const forced: AgentCard = { ...CARD, expiresAt: "500000" };
		expect(agentCardToDescriptor(forced, { now: 1_000_000, online: true }).health?.online).toBe(
			true,
		);
	});
});

describe("did parsing", () => {
	it("accepts did:key values", () => {
		expect(isMoltmeshDid("did:key:z6MkTestAgent")).toBe(true);
	});

	it("rejects non-DIDs", () => {
		expect(isMoltmeshDid("12D3Koo")).toBe(false);
		expect(isMoltmeshDid("did:key:")).toBe(false);
		expect(isMoltmeshDid("")).toBe(false);
	});
});

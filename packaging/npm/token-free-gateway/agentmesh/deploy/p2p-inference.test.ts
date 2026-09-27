import { describe, expect, it } from "vitest";
import { collectP2pPeers, handleP2pInferenceRequest } from "./p2p-inference";

const openHydraPeer = {
	id: "hydra-1",
	peerId: "hydra-1",
	name: "Seoul GPU",
	protocol: "openhydra",
	status: "healthy",
	latencyMs: 42,
	models: ["qwen2.5-7b"],
	capabilities: ["chat"],
	lastSeen: 1_700_000_000_000,
};

describe("collectP2pPeers", () => {
	it("reads peers from P2P_PEERS_JSON and drops malformed records", () => {
		const peers = collectP2pPeers({
			P2P_PEERS_JSON: JSON.stringify({ peers: [openHydraPeer, { id: "broken" }] }),
		});
		expect(peers).toHaveLength(1);
		expect(peers[0]?.protocol).toBe("openhydra");
	});

	it("falls back to XLang peers when the P2P binding is unset", () => {
		const peers = collectP2pPeers({
			XLANG_PEERS_JSON: JSON.stringify({
				peers: [
					{
						peerId: "xlang-1",
						endpoint: "wss://xlang.example/rpc",
						runtime: "xlang",
						capabilities: [{ name: "workflow", kind: "workflow" }],
						supportsStreaming: true,
					},
				],
			}),
		});
		expect(peers).toHaveLength(1);
		expect(peers[0]).toMatchObject({ id: "xlang-1", protocol: "xlang", status: "healthy" });
	});

	it("returns an empty list for malformed configuration", () => {
		expect(collectP2pPeers({ P2P_PEERS_JSON: "not json" })).toEqual([]);
	});
});

describe("handleP2pInferenceRequest", () => {
	it("serves the peer snapshot and rejects non-GET", async () => {
		const env = { P2P_PEERS_JSON: JSON.stringify({ peers: [openHydraPeer] }) };
		const list = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/peers"),
			env,
		);
		expect(list.status).toBe(200);
		const body = (await list.json()) as { peers: unknown[] };
		expect(body.peers).toHaveLength(1);

		const post = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/peers", { method: "POST" }),
			env,
		);
		expect(post.status).toBe(405);
	});

	it("rejects an empty prompt and an oversized prompt", async () => {
		const env = { P2P_PEERS_JSON: JSON.stringify({ peers: [openHydraPeer] }) };
		const empty = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/inference", {
				method: "POST",
				body: JSON.stringify({ prompt: "   " }),
			}),
			env,
		);
		expect(empty.status).toBe(400);

		const oversized = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/inference", {
				method: "POST",
				body: JSON.stringify({ prompt: "x".repeat(9_000) }),
			}),
			env,
		);
		expect(oversized.status).toBe(400);
	});

	it("returns 503 when no peer is registered", async () => {
		const response = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/inference", {
				method: "POST",
				body: JSON.stringify({ prompt: "hi" }),
			}),
			{},
		);
		expect(response.status).toBe(503);
	});

	it("returns 404 for an unknown peer id", async () => {
		const response = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/inference", {
				method: "POST",
				body: JSON.stringify({ prompt: "hi", peerId: "nope" }),
			}),
			{ P2P_PEERS_JSON: JSON.stringify({ peers: [openHydraPeer] }) },
		);
		expect(response.status).toBe(404);
	});

	it("reports dispatch-not-configured instead of pretending to succeed", async () => {
		const response = await handleP2pInferenceRequest(
			new Request("https://muhanai.com/api/p2p/inference", {
				method: "POST",
				body: JSON.stringify({ prompt: "hi" }),
			}),
			{ P2P_PEERS_JSON: JSON.stringify({ peers: [openHydraPeer] }) },
		);
		expect(response.status).toBe(503);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("dispatch-not-configured");
	});
});

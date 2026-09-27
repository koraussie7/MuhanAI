import { describe, expect, it } from "vitest";
import {
	parseP2pInferenceResult,
	parseP2pPeerSnapshot,
	runP2pInference,
} from "./p2p-inference-client";

const peer = {
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

describe("parseP2pPeerSnapshot", () => {
	it("accepts a valid peer list and fills optional fields", () => {
		const snapshot = parseP2pPeerSnapshot({ peers: [peer] });
		expect(snapshot.peers).toHaveLength(1);
		expect(snapshot.peers[0]?.protocol).toBe("openhydra");
	});

	it("drops malformed peers instead of rendering them", () => {
		const snapshot = parseP2pPeerSnapshot({
			peers: [peer, { ...peer, protocol: "smoke-signals" }, { ...peer, latencyMs: "fast" }, null],
		});
		expect(snapshot.peers).toHaveLength(1);
	});

	it("throws when the payload has no peers array", () => {
		expect(() => parseP2pPeerSnapshot({ nope: true })).toThrow("peers array");
	});
});

describe("parseP2pInferenceResult", () => {
	it("requires peerId and text", () => {
		expect(() => parseP2pInferenceResult({ text: "hi" })).toThrow("peerId");
		expect(() => parseP2pInferenceResult({ peerId: "p" })).toThrow("text");
	});

	it("normalizes optional fields", () => {
		expect(parseP2pInferenceResult({ peerId: "p", text: "hi" })).toMatchObject({
			provider: "p2p",
			model: "unknown",
			tier: "p2p",
			latencyMs: 0,
		});
	});
});

describe("runP2pInference", () => {
	it("rejects an empty prompt before making a request", async () => {
		let called = false;
		const fetcher = (async () => {
			called = true;
			return new Response("{}");
		}) as unknown as typeof fetch;
		await expect(runP2pInference({ prompt: "   " }, fetcher)).rejects.toThrow("requires a prompt");
		expect(called).toBe(false);
	});

	it("posts the prompt and returns the parsed result", async () => {
		const requests: Array<{ url: string; body: string }> = [];
		const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
			requests.push({ url: String(input), body: String(init?.body) });
			return new Response(
				JSON.stringify({
					peerId: "hydra-1",
					text: "안녕",
					latencyMs: 120,
					provider: "p2p-openhydra",
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;

		const result = await runP2pInference({ prompt: "hi", peerId: "hydra-1" }, fetcher);
		expect(result.text).toBe("안녕");
		expect(requests[0]?.url).toBe("/api/p2p/inference");
		expect(JSON.parse(requests[0]?.body ?? "{}")).toMatchObject({
			peerId: "hydra-1",
			prompt: "hi",
		});
	});
});

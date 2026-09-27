import { describe, expect, it } from "vitest";
import { XLangRegistry, validateXLangManifest } from "./xlang-registry.js";

const manifest = {
	id: "xlang-agent-1",
	runtime: "xlang" as const,
	peerId: "peer-1",
	endpoint: "wss://xlang.example.test/rpc",
	protocol: "xlang-peer-v1" as const,
	capabilities: [
		{ name: "workflow", kind: "workflow" as const },
		{ name: "tensor.infer", kind: "model" as const },
	],
	models: ["qwen2.5-7b"],
	transports: ["websocket"] as Array<"websocket">,
	supportsStreaming: true,
	createdAt: "2026-09-27T00:00:00.000Z",
};

describe("validateXLangManifest", () => {
	it("accepts a valid manifest", () => {
		expect(validateXLangManifest(manifest)).toEqual({ ok: true, manifest });
	});

	it("rejects invalid protocol, endpoint, and duplicate capabilities", () => {
		expect(validateXLangManifest({ ...manifest, protocol: "xlang-peer-v0" })).toMatchObject({ ok: false });
		expect(validateXLangManifest({ ...manifest, endpoint: "ftp://peer.test" })).toMatchObject({ ok: false });
		expect(
			validateXLangManifest({
				...manifest,
				capabilities: [...manifest.capabilities, manifest.capabilities[0]],
			}),
		).toMatchObject({ ok: false, reason: "capabilities must not contain duplicates" });
	});
});

describe("XLangRegistry", () => {
	it("updates, searches, heartbeats, and evicts stale peers", () => {
		let now = 1_000;
		const registry = new XLangRegistry({ maxAgeMs: 100, now: () => now });
		expect(registry.register(manifest).ok).toBe(true);
		expect(registry.findByCapability("workflow")).toHaveLength(1);
		expect(registry.findByModel("qwen2.5-7b")).toHaveLength(1);
		expect(registry.heartbeat("peer-1")).toBe(true);
		now = 1_101;
		expect(registry.list()).toHaveLength(0);
	});

	it("keeps invalid registrations out of the registry", () => {
		const registry = new XLangRegistry();
		expect(registry.register({ ...manifest, peerId: "" })).toMatchObject({ ok: false });
		expect(registry.list()).toHaveLength(0);
	});
});

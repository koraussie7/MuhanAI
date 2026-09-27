import { describe, expect, it, vi } from "vitest";

import { OpenHydraDiscoveryImpl } from "./discovery";
import type { OpenHydraNode } from "./protocol";

describe("OpenHydraDiscovery", () => {
	describe("discover", () => {
		it("returns empty array when no bootstrap endpoints given", async () => {
			const d = new OpenHydraDiscoveryImpl({ bootstrap: [] });
			expect(await d.discover()).toEqual([]);
		});

		it("returns empty array when bootstrap is undefined", async () => {
			const d = new OpenHydraDiscoveryImpl({ bootstrap: undefined as unknown as string[] });
			expect(await d.discover()).toEqual([]);
		});

		it("returns empty array immediately when signal is already aborted", async () => {
			const controller = new AbortController();
			controller.abort();
			const d = new OpenHydraDiscoveryImpl({ bootstrap: ["ws://localhost:9999"] });
			const nodes = await d.discover(controller.signal);
			expect(nodes).toEqual([]);
		});

		it("filters out null results from probeNode", async () => {
			const d = new OpenHydraDiscoveryImpl({
				bootstrap: ["ws://node-a:8080", "ws://node-b:8080"],
				discoveryTimeoutMs: 100,
			});

			vi.spyOn(d as any, "probeNode")
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce({
					peerId: "b",
					endpoint: "ws://node-b:8080",
					lastSeen: Date.now(),
				});

			const nodes = await d.discover();
			expect(nodes).toHaveLength(1);
			expect(nodes[0]?.endpoint).toBe("ws://node-b:8080");
		});

		it("returns all responding nodes when multiple respond", async () => {
			const d = new OpenHydraDiscoveryImpl({
				bootstrap: ["ws://node-a:8080", "ws://node-b:8080"],
				discoveryTimeoutMs: 100,
			});

			const now = Date.now();
			vi.spyOn(d as any, "probeNode")
				.mockResolvedValueOnce({ peerId: "a", endpoint: "ws://node-a:8080", lastSeen: now })
				.mockResolvedValueOnce({ peerId: "b", endpoint: "ws://node-b:8080", lastSeen: now });

			const nodes = await d.discover();
			expect(nodes).toHaveLength(2);
		});

		it("returns empty array when all probes fail", async () => {
			const d = new OpenHydraDiscoveryImpl({
				bootstrap: ["ws://dead-a:8080", "ws://dead-b:8080"],
				discoveryTimeoutMs: 100,
			});

			vi.spyOn(d as any, "probeNode").mockResolvedValue(null);

			const nodes = await d.discover();
			expect(nodes).toEqual([]);
		});
	});
});

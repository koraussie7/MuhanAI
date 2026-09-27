import { describe, expect, it } from "vitest";
import { parseXLangRegistrySnapshot } from "./xlang-registry-client";

const peer = {
	peerId: "xlang-1",
	endpoint: "wss://peer.example.test/rpc",
	runtime: "xlang",
	capabilities: [{ name: "workflow", kind: "workflow" }],
	supportsStreaming: true,
};

describe("parseXLangRegistrySnapshot", () => {
	it("parses a registry snapshot envelope", () => {
		expect(parseXLangRegistrySnapshot({ peers: [peer], updatedAt: "now" })).toEqual({
			peers: [peer],
			updatedAt: "now",
		});
	});

	it("accepts a bare peer array and rejects invalid entries", () => {
		expect(parseXLangRegistrySnapshot([peer]).peers).toHaveLength(1);
		expect(() => parseXLangRegistrySnapshot({ peers: [{ ...peer, runtime: "other" }] })).toThrow(
			"invalid peers",
		);
	});
});

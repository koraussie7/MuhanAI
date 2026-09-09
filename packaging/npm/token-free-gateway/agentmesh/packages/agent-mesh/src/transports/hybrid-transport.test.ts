import { beforeEach, describe, expect, it, vi } from "vitest";
import { HybridTransport } from "./hybrid-transport.js";
import type { JsonRpcResponse, Peer, TopologySnapshot, Transport } from "./types.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);

const EMPTY_TOPOLOGY: TopologySnapshot = {
	ourPublicKey: PEER_A,
	ourAddress: "::1",
	peers: [],
	fetchedAt: 0,
};

const AXL_TOPOLOGY: TopologySnapshot = {
	ourPublicKey: PEER_A,
	ourAddress: "::1",
	peers: [{ peerId: PEER_B, online: true, transport: "axl" } satisfies Peer],
	fetchedAt: 0,
};

function makeStubTransport(name: string, opts: Partial<Transport> = {}): Transport & {
	send: ReturnType<typeof vi.fn>;
	callMcp: ReturnType<typeof vi.fn>;
} {
	return {
		name,
		start: vi.fn(async () => {}),
		stop: vi.fn(async () => {}),
		getTopology: vi.fn(async () => EMPTY_TOPOLOGY),
		send: vi.fn(async () => ({ sentBytes: 1 })),
		recv: vi.fn(async () => null),
		callMcp: vi.fn(async () => ({ response: { jsonrpc: "2.0", id: null, result: {} } as JsonRpcResponse })),
		callA2a: vi.fn(async () => ({ a2a: true })),
		getAgentCard: vi.fn(async () => null),
		...opts,
	} as Transport & {
		send: ReturnType<typeof vi.fn>;
		callMcp: ReturnType<typeof vi.fn>;
	};
}

describe("HybridTransport", () => {
	let axl: ReturnType<typeof makeStubTransport>;
	let webrtc: ReturnType<typeof makeStubTransport>;

	beforeEach(() => {
		axl = makeStubTransport("axl", {
			getTopology: vi.fn(async () => AXL_TOPOLOGY),
		});
		webrtc = makeStubTransport("webrtc", {
			getTopology: vi.fn(async () => EMPTY_TOPOLOGY),
		});
	});

	it("prefers AXL under axl-first policy", async () => {
		const hybrid = new HybridTransport({ axl, webrtc, policy: "axl-first" });
		await hybrid.start();

		await hybrid.send({ destinationPeerId: PEER_B, payload: new Uint8Array([1]) });

		expect(axl.send).toHaveBeenCalledTimes(1);
		expect(webrtc.send).not.toHaveBeenCalled();
	});

	it("uses the webrtc transport when the peer is seeded there", async () => {
		const hybrid = new HybridTransport({ axl, webrtc, policy: "axl-first" });
		// Skip start() — go straight to seeded routing.
		hybrid._seedRoute(PEER_B, "webrtc");

		await hybrid.send({ destinationPeerId: PEER_B, payload: new Uint8Array([1]) });

		expect(webrtc.send).toHaveBeenCalledTimes(1);
		expect(axl.send).not.toHaveBeenCalled();
	});

	it("falls back to axl on webrtc-first when webrtc is missing", async () => {
		const hybrid = new HybridTransport({ axl, policy: "webrtc-first" });
		await hybrid.send({ destinationPeerId: PEER_B, payload: new Uint8Array([1]) });
		expect(axl.send).toHaveBeenCalledTimes(1);
	});

	it("routes callMcp via the discovered carrier", async () => {
		const hybrid = new HybridTransport({ axl, webrtc, policy: "axl-first" });
		await hybrid.start();
		await hybrid.callMcp(PEER_B, "tools", { jsonrpc: "2.0", id: 1, method: "tools/list" });
		expect(axl.callMcp).toHaveBeenCalledTimes(1);
	});

	it("reports which carrier would handle a peer", async () => {
		const hybrid = new HybridTransport({ axl, webrtc, policy: "axl-first" });
		hybrid._seedRoute(PEER_B, "webrtc");
		expect(hybrid.routeFor(PEER_B)?.name).toBe("webrtc");
		expect(hybrid.routeFor(PEER_A)?.name).toBe("axl");
	});
});

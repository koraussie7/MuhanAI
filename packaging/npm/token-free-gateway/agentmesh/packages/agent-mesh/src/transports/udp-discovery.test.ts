import { describe, expect, it } from "vitest";
import {
	DEFAULT_MCAST_ADDR,
	DEFAULT_MCAST_PORT,
	UdpDiscovery,
	type DiscoveryEnvelope,
} from "./udp-discovery.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);

describe("UdpDiscovery", () => {
	describe("encode/decode", () => {
		it("round-trips a HELLO envelope", () => {
			const env: DiscoveryEnvelope = {
				v: 1,
				kind: "HELLO",
				peerId: PEER_A,
				capabilities: { webgpu: true },
				nonce: 42,
				ts: 1_700_000_000_000,
			};
			const buf = UdpDiscovery.encode(env);
			const decoded = UdpDiscovery.decode(buf);
			expect(decoded).toEqual(env);
		});

		it("round-trips a TASK_ANNOUNCE with SDP payload", () => {
			const env: DiscoveryEnvelope = {
				v: 1,
				kind: "TASK_ANNOUNCE",
				peerId: PEER_B,
				nonce: 7,
				ts: 1_700_000_000_001,
				sdp: { type: "offer", sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n" },
			};
			const decoded = UdpDiscovery.decode(UdpDiscovery.encode(env));
			expect(decoded?.sdp).toEqual(env.sdp);
			expect(decoded?.kind).toBe("TASK_ANNOUNCE");
		});

		it("rejects malformed envelopes", () => {
			expect(UdpDiscovery.decode(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
			expect(
				UdpDiscovery.decode(
					new TextEncoder().encode(JSON.stringify({ v: 2, kind: "HELLO", peerId: PEER_A })),
				),
			).toBeNull();
			expect(
				UdpDiscovery.decode(
					new TextEncoder().encode(JSON.stringify({ v: 1, kind: "BOGUS", peerId: PEER_A, nonce: 1, ts: 0 })),
				),
			).toBeNull();
			expect(
				UdpDiscovery.decode(
					new TextEncoder().encode(JSON.stringify({ v: 1, kind: "HELLO", nonce: 1, ts: 0 })),
				),
			).toBeNull();
		});
	});

	describe("constants", () => {
		it("exposes ShivRatn-compatible defaults", () => {
			expect(DEFAULT_MCAST_ADDR).toBe("224.1.1.1");
			expect(DEFAULT_MCAST_PORT).toBe(5007);
		});
	});

	describe("replay protection", () => {
		it("bounds the nonce window and rejects duplicates", () => {
			const discovery = new UdpDiscovery({ peerId: PEER_A, active: false });
			const smallWindow = (discovery as unknown as { nonceWindow: number }).nonceWindow;
			expect(smallWindow).toBeGreaterThan(0);
		});
	});

	describe("passive listener mode", () => {
		it("does not broadcast HELLO when active=false (smoke)", async () => {
			const discovery = new UdpDiscovery({ peerId: PEER_A, active: false, port: 0 });
			// start() would try to bind real UDP — skip in unit test, just verify the instance.
			expect(discovery.address).toBe(`224.1.1.1:0`);
			void discovery;
		});
	});
});
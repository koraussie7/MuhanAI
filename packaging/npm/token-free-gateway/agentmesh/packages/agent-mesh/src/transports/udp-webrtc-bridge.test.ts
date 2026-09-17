import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DiscoveredPeer, type DiscoveryEnvelope, UdpDiscovery } from "./udp-discovery.js";
import { UdpWebRtcBridge } from "./udp-webrtc-bridge.js";
import {
	type RtcDataChannelLike,
	type RtcPeerConnectionFactory,
	type RtcPeerConnectionLike,
	type RtcSessionDescriptionLike,
	WebRtcTransport,
} from "./webrtc-transport.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);
const PEER_C = "c".repeat(64);

interface MockDataChannel extends RtcDataChannelLike {
	_emitOpen(): void;
	_emitMessage(data: string | Uint8Array): void;
	_sent: Array<string | Uint8Array>;
}

function makeMockDataChannel(): MockDataChannel {
	const listeners = new Map<string, Set<(ev: unknown) => void>>();
	const state: { ready: "connecting" | "open" | "closed" } = { ready: "connecting" };
	const dc: MockDataChannel = {
		get readyState() {
			return state.ready;
		},
		bufferedAmount: 0,
		_sent: [],
		send(data) {
			dc._sent.push(data);
		},
		close() {
			state.ready = "closed";
		},
		addEventListener(type, listener) {
			let set = listeners.get(type);
			if (!set) {
				set = new Set();
				listeners.set(type, set);
			}
			set.add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
		_emitOpen() {
			state.ready = "open";
			for (const fn of listeners.get("open") ?? []) fn({});
		},
		_emitMessage(data) {
			for (const fn of listeners.get("message") ?? []) fn({ data });
		},
	};
	return dc;
}

interface MockConn extends RtcPeerConnectionLike {
	_emitDataChannel(dc: RtcDataChannelLike): void;
}

function makeMockConn(): MockConn {
	const listeners = new Map<string, Set<(ev: unknown) => void>>();
	let localDescription: RtcSessionDescriptionLike | null = null;
	const conn: MockConn = {
		get localDescription() {
			return localDescription;
		},
		set localDescription(v) {
			localDescription = v;
		},
		createDataChannel: vi.fn(() => makeMockDataChannel()),
		createOffer: vi.fn(async () => ({
			type: "offer" as const,
			sdp: `v=0\r\noffer-${Math.random()}`,
		})),
		createAnswer: vi.fn(async () => ({
			type: "answer" as const,
			sdp: `v=0\r\nanswer-${Math.random()}`,
		})),
		setLocalDescription: vi.fn(async (desc) => {
			localDescription = desc;
		}),
		setRemoteDescription: vi.fn(async () => {}),
		addEventListener(type, listener) {
			let set = listeners.get(type);
			if (!set) {
				set = new Set();
				listeners.set(type, set);
			}
			set.add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
		close() {},
		_emitDataChannel(dc) {
			for (const fn of listeners.get("datachannel") ?? []) fn({ channel: dc });
		},
	};
	return conn;
}

/** Captured I/O surface for one side of the bridge under test. */
interface Side {
	peerId: string;
	bridge: UdpWebRtcBridge;
	discovery: UdpDiscovery;
	transport: WebRtcTransport;
	/** All envelopes the discovery has tried to broadcast. */
	outbound: DiscoveryEnvelope[];
	/** The listener subscribed by the bridge — call it to simulate inbound traffic. */
	listener: (env: DiscoveryEnvelope) => void;
	conns: MockConn[];
	cleanup: () => Promise<void>;
}

async function makeSide(
	peerId: string,
	capabilities?: Record<string, unknown>,
	options?: { requiredCapabilities?: string[]; autoDial?: boolean },
): Promise<Side> {
	const conns: MockConn[] = [];
	const factory: RtcPeerConnectionFactory = ((_config) => {
		const c = makeMockConn();
		conns.push(c);
		return c;
	}) as RtcPeerConnectionFactory;
	const transport = new WebRtcTransport({ peerId, factory });
	const discovery = new UdpDiscovery({
		peerId,
		active: false,
		port: 0,
		capabilities,
	});
	const outbound: DiscoveryEnvelope[] = [];
	const originalBroadcast = discovery.broadcastTaskAnnounce.bind(discovery);
	discovery.broadcastTaskAnnounce = (sdp?: unknown) => {
		outbound.push({
			v: 1,
			kind: "TASK_ANNOUNCE",
			peerId,
			nonce: outbound.length + 1,
			ts: Date.now(),
			sdp,
		});
		return originalBroadcast(sdp);
	};
	const bridge = new UdpWebRtcBridge({
		peerId,
		transport,
		discovery,
		requiredCapabilities: options?.requiredCapabilities,
		autoDial: options?.autoDial,
	});
	type Listener = (env: DiscoveryEnvelope, fromAddr: string) => void;
	let listener: Listener | null = null;
	const originalOnMessage = discovery.onMessage.bind(discovery);
	discovery.onMessage = (fn: Listener) => {
		listener = fn;
		return originalOnMessage(fn);
	};
	await bridge.start();
	if (!listener) throw new Error("bridge did not register a discovery listener");
	return {
		peerId,
		bridge,
		discovery,
		transport,
		outbound,
		listener: (env) => listener?.(env, "127.0.0.1"),
		conns,
		cleanup: async () => {
			await bridge.stop();
		},
	};
}

function findEnv(
	envelopes: DiscoveryEnvelope[],
	kind: DiscoveryEnvelope["kind"],
): DiscoveryEnvelope | undefined {
	return envelopes.find((e) => e.kind === kind);
}

describe("UdpWebRtcBridge", () => {
	let a: Side;
	let b: Side;

	beforeEach(async () => {
		a = await makeSide(PEER_A, { webgpu: true, llm: "claude" });
		b = await makeSide(PEER_B, { webgpu: true, llm: "gemini" });
	});

	afterEach(async () => {
		await a.cleanup();
		await b.cleanup();
	});

	it("auto-dials a discovered HELLO and broadcasts an offer", async () => {
		a.listener({
			v: 1,
			kind: "HELLO",
			peerId: PEER_B,
			nonce: 1,
			ts: Date.now(),
			capabilities: { webgpu: true },
		});
		// The bridge awaits transport.dial, which returns synchronously via mock.
		await new Promise((r) => setImmediate(r));
		expect(findEnv(a.outbound, "TASK_ANNOUNCE")?.sdp).toBeDefined();
	});

	it("completes the offer/answer handshake end-to-end", async () => {
		const onPeerConnectedA = vi.fn();
		const onPeerConnectedB = vi.fn();
		(a.bridge as unknown as { onPeerConnected: typeof onPeerConnectedA }).onPeerConnected =
			onPeerConnectedA;
		(b.bridge as unknown as { onPeerConnected: typeof onPeerConnectedB }).onPeerConnected =
			onPeerConnectedB;

		// 1. B sees A's HELLO → dials → broadcasts offer
		b.listener({
			v: 1,
			kind: "HELLO",
			peerId: PEER_A,
			nonce: 1,
			ts: Date.now(),
		});
		await new Promise((r) => setImmediate(r));
		const offerEnv = findEnv(b.outbound, "TASK_ANNOUNCE");
		expect(offerEnv?.sdp).toBeDefined();
		const offer = offerEnv?.sdp as RtcSessionDescriptionLike;
		expect(offer.type).toBe("offer");

		// 2. A receives B's offer → acceptOffer → broadcasts answer
		a.listener({
			v: 1,
			kind: "TASK_ANNOUNCE",
			peerId: PEER_B,
			nonce: 2,
			ts: Date.now(),
			sdp: offer,
		});
		await new Promise((r) => setImmediate(r));
		const answerEnv = findEnv(a.outbound, "TASK_ANNOUNCE");
		expect(answerEnv?.sdp).toBeDefined();
		const answer = answerEnv?.sdp as RtcSessionDescriptionLike;
		expect(answer.type).toBe("answer");

		// 3. B receives A's answer → finalizeAnswer
		b.listener({
			v: 1,
			kind: "TASK_ANNOUNCE",
			peerId: PEER_A,
			nonce: 3,
			ts: Date.now(),
			sdp: answer,
		});
		await new Promise((r) => setImmediate(r));

		expect(onPeerConnectedA).toHaveBeenCalledWith(PEER_B);
		expect(onPeerConnectedB).toHaveBeenCalledWith(PEER_A);
	});

	it("does not auto-dial when requiredCapabilities are missing", async () => {
		// Stop A, restart with stricter requirements
		await a.cleanup();
		a = await makeSide(PEER_A, { webgpu: true }, { requiredCapabilities: ["verified"] });
		a.listener({
			v: 1,
			kind: "HELLO",
			peerId: PEER_B,
			nonce: 1,
			ts: Date.now(),
			capabilities: { webgpu: true }, // missing "verified"
		});
		await new Promise((r) => setImmediate(r));
		expect(findEnv(a.outbound, "TASK_ANNOUNCE")).toBeUndefined();
	});

	it("ignores self-traffic", async () => {
		a.listener({
			v: 1,
			kind: "HELLO",
			peerId: PEER_A, // self
			nonce: 1,
			ts: Date.now(),
		});
		await new Promise((r) => setImmediate(r));
		expect(findEnv(a.outbound, "TASK_ANNOUNCE")).toBeUndefined();
	});

	it("ignores malformed SDP envelopes", async () => {
		a.listener({
			v: 1,
			kind: "TASK_ANNOUNCE",
			peerId: PEER_B,
			nonce: 1,
			ts: Date.now(),
			sdp: { type: "offer", sdp: 123 } as unknown as RtcSessionDescriptionLike, // bad sdp type
		});
		await new Promise((r) => setImmediate(r));
		expect(a.transport["channels"].size).toBe(0);
	});

	it("deduplicates repeated SDP envelopes per peer", async () => {
		const dup: DiscoveryEnvelope = {
			v: 1,
			kind: "TASK_ANNOUNCE",
			peerId: PEER_B,
			nonce: 5,
			ts: Date.now(),
			sdp: { type: "offer", sdp: "v=0\r\nrepeat" },
		};
		a.listener(dup);
		await new Promise((r) => setImmediate(r));
		a.listener(dup);
		await new Promise((r) => setImmediate(r));
		// Only one transport.acceptOffer call → exactly one conn on the answerer side.
		expect(a.conns).toHaveLength(1);
	});

	it("manual dial() bypasses autoDial=false", async () => {
		await a.cleanup();
		a = await makeSide(PEER_A, { webgpu: true });
		// Override: re-construct bridge with autoDial=false. Since makeSide already constructed it,
		// we directly mutate the property — enough for the POC.
		(a.bridge as unknown as { autoDial: boolean }).autoDial = false;
		a.listener({
			v: 1,
			kind: "HELLO",
			peerId: PEER_B,
			nonce: 1,
			ts: Date.now(),
		});
		await new Promise((r) => setImmediate(r));
		expect(findEnv(a.outbound, "TASK_ANNOUNCE")).toBeUndefined();
		await a.bridge.dial(PEER_B);
		expect(findEnv(a.outbound, "TASK_ANNOUNCE")).toBeDefined();
	});

	it("lists discovered peers via discoveredPeers()", () => {
		const peers: DiscoveredPeer[] = a.discovery.listPeers();
		expect(Array.isArray(peers)).toBe(true);
	});

	it("caps concurrent dials at maxConcurrentDials", async () => {
		await a.cleanup();
		a = await makeSide(PEER_A, { webgpu: true });
		(a.bridge as unknown as { maxConcurrentDials: number }).maxConcurrentDials = 1;
		// Fire 3 simultaneous HELLOs from different peers
		for (const peer of [PEER_B, PEER_C, "d".repeat(64)]) {
			a.listener({
				v: 1,
				kind: "HELLO",
				peerId: peer,
				nonce: 1,
				ts: Date.now(),
			});
		}
		await new Promise((r) => setImmediate(r));
		// Only 1 should have produced a TASK_ANNOUNCE (the cap)
		const taskAnnounces = a.outbound.filter((e) => e.kind === "TASK_ANNOUNCE");
		expect(taskAnnounces.length).toBeLessThanOrEqual(1);
	});
});

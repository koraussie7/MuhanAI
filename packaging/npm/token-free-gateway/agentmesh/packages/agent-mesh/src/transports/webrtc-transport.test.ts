import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	type RtcConfiguration,
	type RtcDataChannelLike,
	type RtcPeerConnectionFactory,
	type RtcPeerConnectionLike,
	type RtcSessionDescriptionLike,
	WebRtcTransport,
} from "./webrtc-transport.js";

const PEER_A = "a".repeat(64);
const PEER_B = "b".repeat(64);

interface MockDataChannel extends RtcDataChannelLike {
	_emitOpen(): void;
	_emitMessage(data: string | Uint8Array): void;
	_emitClose(): void;
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
		_emitClose() {
			state.ready = "closed";
			for (const fn of listeners.get("close") ?? []) fn({});
		},
	};
	return dc;
}

interface MockConn extends RtcPeerConnectionLike {
	_emitDataChannel(dc: RtcDataChannelLike): void;
	_emitIceCandidate?(candidate: unknown): void;
}

function makeMockConn(): MockConn {
	const listeners = new Map<string, Set<(ev: unknown) => void>>();
	let localDescription: RtcSessionDescriptionLike | null = null;
	const conn: MockConn = {
		get localDescription() {
			return localDescription;
		},
		createDataChannel: vi.fn(() => makeMockDataChannel()),
		createOffer: vi.fn(async () => {
			const desc: RtcSessionDescriptionLike = { type: "offer", sdp: "v=0\r\nmock-offer" };
			return desc;
		}),
		createAnswer: vi.fn(async () => {
			const desc: RtcSessionDescriptionLike = { type: "answer", sdp: "v=0\r\nmock-answer" };
			return desc;
		}),
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

describe("WebRtcTransport", () => {
	let transport: WebRtcTransport;
	let conns: MockConn[];
	let factory: RtcPeerConnectionFactory;

	beforeEach(() => {
		conns = [];
		factory = ((_config?: RtcConfiguration) => {
			const c = makeMockConn();
			conns.push(c);
			return c;
		}) as RtcPeerConnectionFactory;
		transport = new WebRtcTransport({ peerId: PEER_A, factory });
	});

	it("starts and reports empty topology", async () => {
		await transport.start();
		const snap = await transport.getTopology();
		expect(snap.ourPublicKey).toBe(PEER_A);
		expect(snap.peers).toEqual([]);
	});

	it("dial produces an offer SDP and wires the data channel", async () => {
		await transport.start();
		const sdp = await transport.dial(PEER_B);
		expect(sdp.type).toBe("offer");
		expect(sdp.sdp.length).toBeGreaterThan(0);
		expect(conns).toHaveLength(1);
	});

	it("send delivers bytes to the open datachannel", async () => {
		await transport.start();
		await transport.dial(PEER_B);
		const firstConn = conns[0];
		if (!firstConn) throw new Error("no conn");
		// Wire the data channel by emitting it.
		const dc = makeMockDataChannel();
		firstConn._emitDataChannel(dc);
		dc._emitOpen();
		await transport.send({ destinationPeerId: PEER_B, payload: new Uint8Array([1, 2, 3]) });
		expect(dc._sent).toHaveLength(1);
	});

	it("acceptOffer returns an answer SDP", async () => {
		await transport.start();
		const offer: RtcSessionDescriptionLike = { type: "offer", sdp: "v=0\r\nincoming" };
		const answer = await transport.acceptOffer(PEER_B, offer);
		expect(answer.type).toBe("answer");
		expect(answer.sdp.length).toBeGreaterThan(0);
	});

	it("recv pulls inbound messages from datachannels", async () => {
		await transport.start();
		await transport.dial(PEER_B);
		const firstConn = conns[0];
		if (!firstConn) throw new Error("no conn");
		const dc = makeMockDataChannel();
		firstConn._emitDataChannel(dc);
		dc._emitOpen();
		// Recv should resolve immediately if a message arrives (we poll at 50ms).
		dc._emitMessage("hello");
		const msg = await transport.recv(500);
		expect(msg?.fromPeerId).toBe(PEER_B);
		expect(new TextDecoder().decode(msg?.payload ?? new Uint8Array())).toBe("hello");
	});

	it("finalizeAnswer wires the remote description", async () => {
		await transport.start();
		await transport.dial(PEER_B);
		const firstConn = conns[0];
		if (!firstConn) throw new Error("no conn");
		const dc = makeMockDataChannel();
		firstConn._emitDataChannel(dc);
		dc._emitOpen();
		const answer: RtcSessionDescriptionLike = { type: "answer", sdp: "v=0\r\nanswer-back" };
		await transport.finalizeAnswer(PEER_B, answer);
		expect(firstConn.setRemoteDescription).toHaveBeenCalledWith(answer);
	});

	it("send fails fast when no datachannel exists", async () => {
		await transport.start();
		await expect(
			transport.send({ destinationPeerId: PEER_B, payload: new Uint8Array([1]) }),
		).rejects.toThrow(/no datachannel/);
	});

	it("callMcp throws — not implemented in POC", async () => {
		await transport.start();
		await expect(
			transport.callMcp(PEER_B, "tools", { jsonrpc: "2.0", id: 1, method: "tools/list" }),
		).rejects.toThrow(/not implemented/);
	});

	it("callA2a throws — not implemented in POC", async () => {
		await transport.start();
		await expect(
			transport.callA2a(PEER_B, { a2a: true, request: { jsonrpc: "2.0", id: 1, method: "x" } }),
		).rejects.toThrow(/not implemented/);
	});
});

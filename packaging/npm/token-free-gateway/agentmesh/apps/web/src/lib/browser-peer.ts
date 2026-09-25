import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { identify } from "@libp2p/identify";
import { noise } from "@libp2p/noise";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import { ping } from "@libp2p/ping";
import { yamux } from "@libp2p/yamux";
import { webRTC } from "@libp2p/webrtc";
import { webSockets } from "@libp2p/websockets";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p, type Libp2p } from "libp2p";

const PULSE_TOPIC = "/agentmesh/pulse/1.0.0";
const IDENTITY_KEY = "muhanai.browser.peer.identity.v1";

export interface BrowserPeerSession {
	peerId: string;
	token: string;
	multiaddr: string | null;
}

interface EnrollmentResponse {
	peer: { id: string };
	token: string;
	relay?: { multiaddr?: string | null };
}

interface PulseMessage {
	v: 1;
	kind: "pulse" | "presence" | "request" | "reply";
	fromPeerId: string;
	payload: unknown;
	ts: number;
}

let node: Libp2p | null = null;
let heartbeatTimer: number | undefined;

async function browserPrivateKey() {
	const stored = localStorage.getItem(IDENTITY_KEY);
	if (stored) return privateKeyFromProtobuf(Uint8Array.from(atob(stored), (char) => char.charCodeAt(0)));
	const key = await generateKeyPair("Ed25519");
	const bytes = privateKeyToProtobuf(key);
	localStorage.setItem(IDENTITY_KEY, btoa(String.fromCharCode(...bytes)));
	return key;
}

function encodePulse(message: PulseMessage): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(message));
}

function decodePulse(data: Uint8Array): PulseMessage | null {
	try {
		const message = JSON.parse(new TextDecoder().decode(data)) as PulseMessage;
		return message.v === 1 && typeof message.fromPeerId === "string" ? message : null;
	} catch {
		return null;
	}
}

export async function startBrowserPeer(): Promise<BrowserPeerSession | null> {
	if (node) return null;
	try {
		const enrollment = await fetch("/api/visitors/enroll", {
			method: "POST",
			headers: { "content-type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ path: window.location.pathname, capabilities: ["presence", "pulse-read", "webrtc"] }),
		});
		if (!enrollment.ok) return null;
		const data = (await enrollment.json()) as EnrollmentResponse;
		const relayAddress = data.relay?.multiaddr;
		if (!relayAddress) return null;

		const privateKey = await browserPrivateKey();
		node = await createLibp2p({
			privateKey,
			addresses: { listen: ["/p2p-circuit", "/webrtc"] },
			transports: [webSockets(), webRTC(), circuitRelayTransport()],
			connectionEncrypters: [noise()],
			streamMuxers: [yamux()],
			connectionGater: { denyDialMultiaddr: () => false },
			services: { identify: identify(), ping: ping() },
		});
		await node.dial(multiaddr(relayAddress));
		const peerId = peerIdFromPrivateKey(privateKey).toString();
		const pubsub = node.services.pubsub as {
			subscribe(topic: string): void;
			publish(topic: string, data: Uint8Array): Promise<void>;
			addEventListener(type: string, listener: (event: CustomEvent<{ topic?: string; data?: Uint8Array }>) => void): void;
		};
		pubsub.subscribe(PULSE_TOPIC);
		pubsub.addEventListener("message", (event) => {
			const detail = event.detail;
			if (detail.topic !== PULSE_TOPIC || !detail.data) return;
			const message = decodePulse(detail.data);
			if (message) window.dispatchEvent(new CustomEvent("muhanai:peer-pulse", { detail: message }));
		});
		await pubsub.publish(
			PULSE_TOPIC,
			encodePulse({ v: 1, kind: "presence", fromPeerId: peerId, payload: { path: window.location.pathname }, ts: Date.now() }),
		);
		heartbeatTimer = window.setInterval(() => {
			void Promise.resolve(
				fetch("/api/visitors/heartbeat", {
					method: "POST",
					headers: { "content-type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ token: data.token, path: window.location.pathname }),
				}),
			);
		}, 30_000);
		return { peerId, token: data.token, multiaddr: relayAddress };
	} catch {
		await stopBrowserPeer();
		return null;
	}
}

export async function stopBrowserPeer(): Promise<void> {
	if (heartbeatTimer !== undefined) window.clearInterval(heartbeatTimer);
	heartbeatTimer = undefined;
	if (node) {
		try {
			await node.stop();
		} catch {
			// The browser node may already be closed during page teardown.
		}
	}
	node = null;
}

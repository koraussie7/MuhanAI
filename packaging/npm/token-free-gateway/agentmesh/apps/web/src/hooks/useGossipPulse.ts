/**
 * useGossipPulse — React hook that consumes the SSE pulse stream from
 * services/api (`GET /api/pulse/stream`, see ADR-0004) and surfaces the
 * messages as React state.
 *
 * Architectural intent:
 *   - The lifecycle logic lives in `pulse-subscriber.ts` (pure module).
 *     This file is just the React adapter — useState + useEffect plumbing.
 *   - Mirrors @agentmesh/p2p PulseMessage locally so apps/web does not
 *     pull libp2p into the browser bundle. Drift risk is bounded by the
 *     runtime `v === 1` check in the subscriber.
 *
 * Reconnect strategy:
 *   - EventSource natively reconnects on transient errors using the
 *     server's `retry:` hint (we send 3000ms). We do not re-implement it.
 *   - `close()` is the only way to stop reconnects permanently.
 *   - `reconnect()` bumps a nonce that re-runs the effect to open a new
 *     EventSource — useful when the user manually toggles connection state.
 *
 * Graceful degradation:
 *   - SSR-safe: if `window.EventSource` is missing, status is "unsupported"
 *     and the hook returns empty arrays. Callers render a fallback UI.
 *   - Malformed JSON payloads are silently dropped (we trust the server).
 *   - `disabled` option lets callers opt out (e.g. when offline).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPulseSubscriber, type EventSourceCtor } from "./pulse-subscriber.js";

export type PulseKind = "pulse" | "presence" | "request" | "reply" | "credit";

/**
 * Mirror of @agentmesh/p2p PulseMessage (packages/p2p/src/pubsub.ts).
 * Kept local so apps/web does not bundle libp2p.
 */
export interface PulseMessage {
	v: 1;
	kind: PulseKind;
	fromPeerId: string;
	payload: unknown;
	ts: number;
}

export type PulseConnectionStatus = "connecting" | "open" | "closed" | "unsupported";

export interface UseGossipPulseOptions {
	/** SSE endpoint. Defaults to `/api/pulse/stream`. */
	url?: string;
	/** Max messages kept in the buffer (FIFO eviction). Default 50. */
	bufferSize?: number;
	/** Optional filter — receive only messages whose kind is in this list. */
	kinds?: PulseKind[];
	/** Disable the connection (offline, SSR, test). Default false. */
	disabled?: boolean;
	/** Custom EventSource constructor (for testing). */
	EventSource?: EventSourceCtor;
}

export interface UseGossipPulseResult {
	/** Buffered messages, oldest first. */
	messages: PulseMessage[];
	/** Most recent message, or null if none received yet. */
	latest: PulseMessage | null;
	/** Current connection status. */
	status: PulseConnectionStatus;
	/** Number of times the connection has been (re)opened. */
	reconnectCount: number;
	/** Permanently close the connection. */
	close: () => void;
	/** Force-reconnect (re-opens a fresh EventSource). */
	reconnect: () => void;
}

export function useGossipPulse(opts: UseGossipPulseOptions = {}): UseGossipPulseResult {
	const { url = "/api/pulse/stream", bufferSize = 50, kinds, disabled = false, EventSource } = opts;

	const [messages, setMessages] = useState<PulseMessage[]>([]);
	const [latest, setLatest] = useState<PulseMessage | null>(null);
	const [status, setStatus] = useState<PulseConnectionStatus>("connecting");
	const [reconnectCount, setReconnectCount] = useState(0);
	const [_nonce, setNonce] = useState(0);

	const bufferRef = useRef<PulseMessage[]>([]);
	const _kindsKey = kinds ? kinds.join(",") : "";

	useEffect(() => {
		if (disabled) {
			setStatus("closed");
			return;
		}
		if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
			setStatus("unsupported");
			return;
		}

		bufferRef.current = [];
		setMessages([]);
		setLatest(null);

		const handle = createPulseSubscriber({
			url,
			bufferSize,
			kinds,
			EventSource,
			onStatus: setStatus,
			onReconnect: () => setReconnectCount((n) => n + 1),
			onMessage: (msg) => {
				const next = bufferRef.current.concat(msg);
				bufferRef.current = next.length > bufferSize ? next.slice(-bufferSize) : next;
				setMessages(bufferRef.current);
				setLatest(msg);
			},
		});

		return handle.dispose;
	}, [url, bufferSize, disabled, EventSource, kinds]);

	const close = useCallback(() => {
		setStatus("closed");
		setNonce((n) => n + 1);
	}, []);

	const reconnect = useCallback(() => {
		setNonce((n) => n + 1);
	}, []);

	return { messages, latest, status, reconnectCount, close, reconnect };
}

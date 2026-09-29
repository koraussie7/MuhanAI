import type { XLangPeerInfo } from "@agentmesh/ai-engine";
import { useCallback, useEffect, useState } from "react";
import { fetchXLangRegistrySnapshot } from "../lib/xlang-registry-client.js";

const STORAGE_KEY = "muhanai.xlang.peers";

function isXLangPeerInfo(value: unknown): value is XLangPeerInfo {
	if (!value || typeof value !== "object") return false;
	const peer = value as Record<string, unknown>;
	if (typeof peer.peerId !== "string" || typeof peer.endpoint !== "string") return false;
	try {
		const url = new URL(peer.endpoint);
		if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;
	} catch {
		return false;
	}
	if (peer.runtime !== "xlang" || typeof peer.supportsStreaming !== "boolean") return false;
	if (!Array.isArray(peer.capabilities)) return false;
	return peer.capabilities.every(
		(capability) =>
			capability &&
			typeof capability === "object" &&
			typeof (capability as { name?: unknown }).name === "string",
	);
}

function readPeers(): { peers: XLangPeerInfo[]; error: string | null } {
	if (typeof window === "undefined") return { peers: [], error: null };
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return { peers: [], error: null };
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return { peers: [], error: "Stored peer data is not a list." };
		const peers = parsed.filter(isXLangPeerInfo);
		return {
			peers,
			error: peers.length === parsed.length ? null : "Some stored peer records were ignored.",
		};
	} catch {
		return { peers: [], error: "Stored peer data could not be read." };
	}
}

export function XLangPeersPage() {
	const [state, setState] = useState(readPeers);
	const [loading, setLoading] = useState(false);
	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const snapshot = await fetchXLangRegistrySnapshot();
			setState({ peers: snapshot.peers, error: null });
		} catch (error) {
			const fallback = readPeers();
			const reason = error instanceof Error ? error.message : "request failed";
			const errorMessage =
				fallback.peers.length > 0
					? `Live registry unavailable; showing cached peers (${reason}).`
					: reason;
			setState({
				peers: fallback.peers,
				error: errorMessage || "XLang registry request failed.",
			});
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, [refresh]);

	return (
		<section style={{ padding: 32 }}>
			<div
				style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}
			>
				<div>
					<h1>XLang Peers</h1>
					<p style={{ color: "var(--cline-text-muted)" }}>
						Workflow, tensor, IPC, and device-capable XLang runtimes discovered by AgentMesh.
					</p>
				</div>
				<button type="button" onClick={() => void refresh()} disabled={loading}>
					{loading ? "Refreshing…" : "Refresh"}
				</button>
			</div>
			{state.error && <output>{state.error}</output>}
			{state.peers.length === 0 ? (
				<div className="placeholder-page">No XLang peers discovered yet.</div>
			) : (
				<div style={{ display: "grid", gap: 12 }}>
					{state.peers.map((peer) => (
						<article key={peer.peerId} className="placeholder-page">
							<strong>{peer.peerId}</strong>
							<div>{peer.endpoint}</div>
							<div>{peer.capabilities.map((capability) => capability.name).join(", ")}</div>
							<div>{peer.supportsStreaming ? "Streaming" : "Non-streaming"}</div>
						</article>
					))}
				</div>
			)}
		</section>
	);
}

import { useCallback, useEffect, useState } from "react";

export interface P2pInferencePeer {
	id: string;
	peerId: string;
	name?: string;
	protocol: "openhydra" | "xlang" | "ollama" | "libp2p";
	status: "healthy" | "degraded" | "offline";
	latencyMs: number;
	models?: string[];
	capabilities?: string[];
	lastSeen: number;
}

export interface P2pInferenceSnapshot {
	peers: P2pInferencePeer[];
	updatedAt?: string;
}

const STORAGE_KEY = "muhanai.p2p.inference.peers";

function isPeerInfo(value: unknown): value is P2pInferencePeer {
	if (!value || typeof value !== "object") return false;
	const peer = value as Record<string, unknown>;
	if (typeof peer.id !== "string" || typeof peer.peerId !== "string") return false;
	if (!["openhydra", "xlang", "ollama", "libp2p"].includes(String(peer.protocol))) return false;
	if (!["healthy", "degraded", "offline"].includes(String(peer.status))) return false;
	if (typeof peer.latencyMs !== "number" || !Number.isFinite(peer.latencyMs)) return false;
	if (typeof peer.lastSeen !== "number" || !Number.isFinite(peer.lastSeen)) return false;
	return true;
}

function parseSnapshot(value: unknown): P2pInferenceSnapshot {
	const rawPeers = Array.isArray(value)
		? value
		: value && typeof value === "object" && Array.isArray((value as { peers?: unknown }).peers)
			? (value as { peers: unknown[] }).peers
			: null;
	if (!rawPeers) throw new Error("P2P inference snapshot must contain a peers array");
	const peers = rawPeers.filter(isPeerInfo);
	if (peers.length !== rawPeers.length)
		throw new Error("P2P inference snapshot contains invalid peers");
	return {
		peers,
		...(value &&
		typeof value === "object" &&
		typeof (value as { updatedAt?: unknown }).updatedAt === "string"
			? { updatedAt: (value as { updatedAt: string }).updatedAt }
			: {}),
	};
}

function readCachedPeers(): { peers: P2pInferencePeer[]; error: string | null } {
	if (typeof window === "undefined") return { peers: [], error: null };
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return { peers: [], error: null };
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return { peers: [], error: "Stored peer data is not a list." };
		const peers = parsed.filter(isPeerInfo);
		return {
			peers,
			error: peers.length === parsed.length ? null : "Some stored peer records were ignored.",
		};
	} catch {
		return { peers: [], error: "Stored peer data could not be read." };
	}
}

async function fetchP2pInferencePeers(): Promise<P2pInferenceSnapshot> {
	const response = await fetch("/api/p2p/peers", {
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`P2P inference registry returned HTTP ${response.status}`);
	return parseSnapshot(await response.json());
}

async function dispatchInference(peerId: string, prompt: string, model?: string): Promise<string> {
	const response = await fetch("/api/p2p/inference", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ peerId, prompt, model }),
	});
	if (!response.ok) {
		const err = await response.json().catch(() => ({ message: "inference failed" }));
		throw new Error(err.message || `inference failed: ${response.status}`);
	}
	const data = await response.json();
	return data.text ?? "";
}

function formatRelativeTime(ts: number): string {
	const diff = Date.now() - ts;
	if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return new Date(ts).toLocaleDateString();
}

function StatusBadge({ status }: { status: P2pInferencePeer["status"] }) {
	const colors: Record<P2pInferencePeer["status"], string> = {
		healthy: "var(--cline-green)",
		degraded: "var(--cline-amber)",
		offline: "var(--cline-red)",
	};
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				padding: "2px 8px",
				borderRadius: 999,
				fontSize: 11,
				fontWeight: 600,
				background: `${colors[status]}20`,
				color: colors[status],
			}}
		>
			<span
				style={{
					width: 6,
					height: 6,
					borderRadius: "50%",
					background: colors[status],
				}}
			/>
			{status}
		</span>
	);
}

function ProtocolBadge({ protocol }: { protocol: P2pInferencePeer["protocol"] }) {
	const colors: Record<P2pInferencePeer["protocol"], string> = {
		openhydra: "#8b5cf6",
		xlang: "#06b6d4",
		ollama: "#f59e0b",
		libp2p: "#ec4899",
	};
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				padding: "2px 8px",
				borderRadius: 999,
				fontSize: 11,
				fontWeight: 600,
				background: `${colors[protocol]}20`,
				color: colors[protocol],
			}}
		>
			{protocol.toUpperCase()}
		</span>
	);
}

export function P2pInferencePage() {
	const [state, setState] = useState(readCachedPeers);
	const [loading, setLoading] = useState(false);
	const [testingPeer, setTestingPeer] = useState<string | null>(null);
	const [testPrompt, setTestPrompt] = useState("");
	const [testResult, setTestResult] = useState<string | null>(null);
	const [testError, setTestError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setTestResult(null);
		setTestError(null);
		try {
			const snapshot = await fetchP2pInferencePeers();
			if (typeof window !== "undefined") {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.peers));
			}
			setState({ peers: snapshot.peers, error: null });
		} catch (error) {
			const fallback = readCachedPeers();
			const reason = error instanceof Error ? error.message : "request failed";
			const errorMessage =
				fallback.peers.length > 0
					? `Live registry unavailable; showing cached peers (${reason}).`
					: reason;
			setState({
				peers: fallback.peers,
				error: errorMessage || "P2P inference registry request failed.",
			});
		} finally {
			setLoading(false);
		}
	}, []);

	const handleTestInference = useCallback(
		async (peer: P2pInferencePeer) => {
			if (!testPrompt.trim()) {
				setTestError("Please enter a test prompt");
				return;
			}
			setTestingPeer(peer.id);
			setTestError(null);
			setTestResult(null);
			try {
				const model = peer.models?.[0];
				const text = await dispatchInference(peer.id, testPrompt, model);
				setTestResult(text);
			} catch (error) {
				setTestError(error instanceof Error ? error.message : "Inference failed");
			} finally {
				setTestingPeer(null);
			}
		},
		[testPrompt],
	);

	useEffect(() => {
		void refresh();
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, [refresh]);

	return (
		<section style={{ padding: 32 }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					gap: 16,
					alignItems: "center",
					flexWrap: "wrap",
				}}
			>
				<div>
					<h1>P2P Distributed Inference</h1>
					<p style={{ color: "var(--cline-text-muted)" }}>
						Decentralized LLM inference across XLang, OpenHydra, Ollama, and libp2p peers.
					</p>
				</div>
				<button type="button" onClick={() => void refresh()} disabled={loading}>
					{loading ? "Refreshing…" : "Refresh Peers"}
				</button>
			</div>

			{state.error && (
				<output style={{ color: "var(--cline-red)", marginBottom: 16 }}>{state.error}</output>
			)}

			{state.peers.length === 0 ? (
				<div className="placeholder-page">
					<p>No P2P inference peers discovered yet.</p>
					<p style={{ color: "var(--cline-text-muted)", marginTop: 8 }}>
						Set <code>P2P_PEERS_JSON</code> or <code>XLANG_PEERS_JSON</code> on the Cloudflare
						Worker to register peers.
					</p>
				</div>
			) : (
				<div style={{ display: "grid", gap: 12 }}>
					{state.peers.map((peer) => (
						<article
							key={peer.id}
							className="placeholder-page"
							style={{ display: "grid", gap: 12, padding: 16 }}
						>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
								<strong style={{ fontSize: 16 }}>{peer.name || peer.peerId}</strong>
								<code style={{ fontSize: 11, opacity: 0.6 }}>{peer.peerId}</code>
								<ProtocolBadge protocol={peer.protocol} />
								<StatusBadge status={peer.status} />
								<span style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>
									{peer.latencyMs}ms · {formatRelativeTime(peer.lastSeen)}
								</span>
							</div>
							{peer.models?.length && (
								<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
									{peer.models.map((model) => (
										<span
											key={model}
											style={{
												fontSize: 12,
												padding: "2px 8px",
												borderRadius: 4,
												background: "var(--cline-border)",
												color: "var(--cline-text-muted)",
											}}
										>
											{model}
										</span>
									))}
								</div>
							)}
							{peer.capabilities?.length && (
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>
									Capabilities: {peer.capabilities.join(", ")}
								</div>
							)}
							<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
								<input
									type="text"
									placeholder="Test prompt…"
									value={testPrompt}
									onChange={(e) => setTestPrompt(e.target.value)}
									style={{
										flex: 1,
										minWidth: 200,
										padding: "8px 12px",
										borderRadius: 6,
										border: "1px solid var(--cline-border)",
										background: "var(--cline-primary-bg)",
										color: "var(--cline-text)",
										fontSize: 13,
									}}
								/>
								<button
									type="button"
									onClick={() => handleTestInference(peer)}
									disabled={testingPeer === peer.id || !testPrompt.trim()}
									style={{
										padding: "8px 16px",
										borderRadius: 6,
										border: "none",
										background:
											testingPeer === peer.id ? "var(--cline-text-muted)" : "var(--cline-accent)",
										color: "var(--cline-primary-bg)",
										fontWeight: 600,
										cursor: testingPeer === peer.id ? "not-allowed" : "pointer",
									}}
								>
									{testingPeer === peer.id ? "Running…" : "Test Inference"}
								</button>
							</div>
							{testResult && testingPeer === peer.id && (
								<div
									style={{
										marginTop: 12,
										padding: 12,
										borderRadius: 6,
										background: "var(--cline-green)15",
										border: "1px solid var(--cline-green)40",
									}}
								>
									<strong>Result:</strong>
									<pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13 }}>
										{testResult}
									</pre>
								</div>
							)}
							{testError && testingPeer === peer.id && (
								<div
									style={{
										marginTop: 12,
										padding: 12,
										borderRadius: 6,
										background: "var(--cline-red)15",
										border: "1px solid var(--cline-red)40",
										color: "var(--cline-red)",
									}}
								>
									<strong>Error:</strong> {testError}
								</div>
							)}
						</article>
					))}
				</div>
			)}
		</section>
	);
}

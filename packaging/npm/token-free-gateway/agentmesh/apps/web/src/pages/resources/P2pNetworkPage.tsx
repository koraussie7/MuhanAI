import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { SpecPage as Page } from "../../components/common/spec";
import {
	fetchP2pPeers,
	type P2pInferencePeer,
	type P2pInferenceResult,
	runP2pInference,
} from "../../lib/p2p-inference-client";

type Tab = "inference" | "peers";

interface InferenceRun {
	id: string;
	peerId: string;
	peerName: string;
	prompt: string;
	result: P2pInferenceResult | null;
	error: string | null;
	at: number;
}

const PROTOCOL_LABEL: Record<P2pInferencePeer["protocol"], string> = {
	openhydra: "OpenHydra",
	xlang: "XLang",
	ollama: "Ollama",
	libp2p: "libp2p",
};

export function P2pNetworkPage() {
	const [peers, setPeers] = useState<P2pInferencePeer[]>([]);
	const [peersError, setPeersError] = useState<string | null>(null);
	const [peersLoading, setPeersLoading] = useState(false);
	const [activeTab, setActiveTab] = useState<Tab>("inference");

	const [peerId, setPeerId] = useState("");
	const [model, setModel] = useState("");
	const [prompt, setPrompt] = useState("한국어로 한 문장으로 자기소개해줘");
	const [running, setRunning] = useState(false);
	const [runs, setRuns] = useState<InferenceRun[]>([]);
	const refreshPeers = useCallback(async () => {
		setPeersLoading(true);
		try {
			const snapshot = await fetchP2pPeers();
			setPeers(snapshot.peers);
			setPeersError(null);
			setPeerId((current) => current || snapshot.peers[0]?.id || "");
		} catch (error) {
			setPeersError(
				error instanceof Error ? error.message : "P2P 피어 목록을 불러오지 못했습니다.",
			);
		} finally {
			setPeersLoading(false);
		}
	}, []);

	useEffect(() => {
		void refreshPeers();
		const timer = setInterval(() => void refreshPeers(), 30_000);
		return () => clearInterval(timer);
	}, [refreshPeers]);

	const selectedPeer = peers.find((peer) => peer.id === peerId) ?? null;
	const healthyCount = peers.filter((peer) => peer.status === "healthy").length;

	const submit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!prompt.trim() || running) return;
		setRunning(true);
		try {
			const result = await runP2pInference({
				...(peerId ? { peerId } : {}),
				prompt,
				...(model.trim() ? { model: model.trim() } : {}),
			});
			setRuns((prev) => [
				{
					id: `run-${Date.now()}`,
					peerId: result.peerId,
					peerName: peers.find((peer) => peer.id === result.peerId)?.name ?? result.peerId,
					prompt,
					result,
					error: null,
					at: Date.now(),
				},
				...prev,
			]);
		} catch (error) {
			setRuns((prev) => [
				{
					id: `run-${Date.now()}`,
					peerId: peerId || "auto",
					peerName: selectedPeer?.name ?? "auto",
					prompt,
					result: null,
					error: error instanceof Error ? error.message : "추론 요청이 실패했습니다.",
					at: Date.now(),
				},
				...prev,
			]);
		} finally {
			setRunning(false);
		}
	};

	return (
		<Page
			title="P2P Inference Network"
			subtitle="분산 추론 피어 현황과 실시간 추론 요청 — OpenHydra / XLang / Ollama / libp2p"
		>
			<div className="p2p-node-banner">
				<div className="node-id-chip">
					<span className={`pulse-dot ${healthyCount > 0 ? "on" : ""}`} />
					<span>
						Peers:{" "}
						<strong>
							{healthyCount}/{peers.length}
						</strong>{" "}
						healthy
					</span>
				</div>
				<div className="router-quick-stats">
					<button
						type="button"
						className="secondary-button"
						onClick={() => void refreshPeers()}
						disabled={peersLoading}
					>
						{peersLoading ? "갱신 중…" : "피어 새로고침"}
					</button>
				</div>
			</div>

			{peersError && (
				<p role="status" style={{ color: "var(--accent)", marginTop: 12 }}>
					{peersError}
				</p>
			)}

			<div className="policy-row" style={{ marginTop: "16px", marginBottom: "16px" }}>
				<button
					type="button"
					className={`policy-chip ${activeTab === "inference" ? "active" : ""}`}
					onClick={() => setActiveTab("inference")}
				>
					⚡ 추론 요청
				</button>
				<button
					type="button"
					className={`policy-chip ${activeTab === "peers" ? "active" : ""}`}
					onClick={() => setActiveTab("peers")}
				>
					🕸️ 추론 피어 ({peers.length})
				</button>
			</div>

			{activeTab === "inference" && (
				<div className="p2p-router-layout">
					<div className="dash-block router-send-card">
						<h3>⚡ P2P 추론 요청</h3>
						<form onSubmit={submit} className="router-form">
							<div className="form-group">
								<label htmlFor="p2p-peer">대상 피어</label>
								<select id="p2p-peer" value={peerId} onChange={(e) => setPeerId(e.target.value)}>
									<option value="">자동 선택 (healthiest)</option>
									{peers.map((peer) => (
										<option key={peer.id} value={peer.id}>
											{peer.name} · {PROTOCOL_LABEL[peer.protocol]} · {peer.latencyMs}ms ·{" "}
											{peer.status}
										</option>
									))}
								</select>
							</div>

							<div className="form-group">
								<label htmlFor="p2p-model">모델 (선택 사항)</label>
								<input
									id="p2p-model"
									type="text"
									value={model}
									onChange={(e) => setModel(e.target.value)}
									placeholder={selectedPeer?.models[0] ?? "피어가 제공하는 모델"}
								/>
							</div>

							<div className="form-group">
								<label htmlFor="p2p-prompt">프롬프트</label>
								<textarea
									id="p2p-prompt"
									rows={4}
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									className="router-textarea"
								/>
							</div>

							<button
								type="submit"
								className="primary-button"
								style={{ width: "100%", justifyContent: "center" }}
								disabled={running || !prompt.trim() || peers.length === 0}
							>
								{running ? "추론 중…" : "P2P로 추론"}
							</button>
							{peers.length === 0 && (
								<p style={{ fontSize: "12px", color: "var(--muted)", marginTop: 8 }}>
									등록된 P2P 피어가 없습니다. Worker에 P2P_PEERS_JSON 또는 XLANG_PEERS_JSON을
									설정하세요.
								</p>
							)}
						</form>
					</div>

					<div className="dash-block router-queue-card">
						<h3>📄 추론 결과</h3>
						{runs.length === 0 ? (
							<p style={{ fontSize: "13px", color: "var(--muted)" }}>
								아직 실행한 추론이 없습니다.
							</p>
						) : (
							<div className="packet-list">
								{runs.slice(0, 8).map((run) => (
									<div className="packet-item" key={run.id}>
										<div className="packet-header">
											<span className="packet-id">{run.peerName}</span>
											{run.result ? (
												<span className="status-pill delivered">{run.result.latencyMs}ms</span>
											) : (
												<span className="status-pill failed">failed</span>
											)}
											<span className="packet-ttl">{new Date(run.at).toLocaleTimeString()}</span>
										</div>
										<p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0" }}>
											&lt; {run.prompt}
										</p>
										{run.result ? (
											<>
												<p style={{ margin: "6px 0", fontSize: "13px" }}>{run.result.text}</p>
												<div className="packet-meta">
													<span>{run.result.provider}</span>
													<span>{run.result.model}</span>
													<span>{run.result.tier}</span>
												</div>
											</>
										) : (
											<p style={{ margin: "6px 0", fontSize: "13px", color: "var(--accent)" }}>
												{run.error}
											</p>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}

			{activeTab === "peers" && (
				<div className="spec-grid">
					{peers.length === 0 ? (
						<div className="placeholder-page">
							{peersError ? "피어 목록을 불러오지 못했습니다." : "등록된 P2P 추론 피어가 없습니다."}
						</div>
					) : (
						peers.map((peer) => (
							<div className="spec-card" key={peer.id}>
								<div className="spec-card-head">
									<span className={`status-dot ${peer.status}`} />
									<span className="spec-kind">{PROTOCOL_LABEL[peer.protocol]}</span>
									<span className="latency-badge">{peer.latencyMs}ms</span>
								</div>
								<h3 style={{ margin: "10px 0 4px" }}>{peer.name}</h3>
								<p style={{ fontSize: "12px", color: "var(--muted)", margin: "0 0 12px" }}>
									ID: {peer.peerId}
								</p>
								<div className="spec-tags">
									{peer.models.map((m) => (
										<span className="spec-tag" key={m}>
											{m}
										</span>
									))}
									{peer.capabilities.map((c) => (
										<span className="spec-tag" key={c}>
											✓ {c}
										</span>
									))}
								</div>
								<div style={{ marginTop: "14px" }}>
									<button
										type="button"
										className="secondary-button"
										onClick={() => {
											setPeerId(peer.id);
											setActiveTab("inference");
										}}
										style={{ fontSize: "12px", padding: "6px 10px" }}
									>
										이 피어로 추론
									</button>
								</div>
							</div>
						))
					)}
				</div>
			)}
		</Page>
	);
}

// ---- Compute Mesh ----

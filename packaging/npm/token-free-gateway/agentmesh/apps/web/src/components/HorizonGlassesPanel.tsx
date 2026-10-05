/**
 * Horizon Glasses — Wearable Edge integration panel.
 *
 * Surfaces the MuhanAI × Horizon AI Glasses (Rokid + Android) integration:
 *  - P0–P3 rollout: keyless edge proxy → MCP device bridge → P2P/DID → knowledge economy
 *  - On-device safety capabilities that never leave the device
 *  - Voice actions exposed to the mesh as MCP tools (keyless, consent-gated)
 *
 * Design:   docs/horizon-glasses-integration-design.md
 * Contract: docs/horizon-glasses-api-contract.md
 */

import { Download, Glasses, ShieldCheck, Smartphone, Zap } from "lucide-react";
import type React from "react";

interface Phase {
	id: string;
	title: string;
	desc: string;
	status: "next" | "planned";
}

const PHASES: readonly Phase[] = [
	{
		id: "P0",
		title: "Keyless edge proxy",
		desc: "DeepSeek/GLM keys move to the muhanai.com Worker; the device holds only a device token.",
		status: "next",
	},
	{
		id: "P1",
		title: "MCP device bridge",
		desc: "27 voice actions register as MCP tools; agent-router decides call order, retries, summaries.",
		status: "planned",
	},
	{
		id: "P2",
		title: "P2P + DID",
		desc: "Ed25519 device DID joins the libp2p floodsub mesh; voice memories sync over CRDT.",
		status: "planned",
	},
	{
		id: "P3",
		title: "Knowledge economy",
		desc: "First-person accessibility reports → Verify Me → credits → crowded-sourced access map.",
		status: "planned",
	},
];

const ON_DEVICE: readonly string[] = [
	"Traffic-light detection — TFLite YOLOv8, 3-frame stability",
	"Blind-path detection — TFLite int8, offset guidance",
	"Offline ASR — Vosk CN/EN with TTS playback loop",
	"QR scan & OCR — ML Kit",
];

const MESH_TOOLS: readonly string[] = [
	"intent → enum-constrained, quorum fallback",
	"translate / interpret → llm-router (keyless first)",
	"vision.solve → GLM-4V proxy, consent-gated image only",
	"knowledge.publish / search → CRDT knowledge lake",
];

const CARD_STYLE: React.CSSProperties = {
	background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
	border: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
	borderRadius: 10,
	padding: "14px 16px",
};

const LIST_ITEM_STYLE: React.CSSProperties = {
	display: "flex",
	alignItems: "flex-start",
	gap: 8,
	color: "var(--cline-text-muted)",
	fontSize: 12,
	lineHeight: 1.6,
	marginBottom: 8,
};

export const HorizonGlassesPanel: React.FC = () => (
	<div className="cline-chat-container">
		<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<Glasses size={28} style={{ color: "#38bdf8" }} />
				<div>
					<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
						Horizon Glasses — Wearable Edge
					</h1>
					<p className="dashboard-hero-desc">
						Rokid 글래스 + Android 앱을 MuhanAI 메쉬의 1인칭 감각 엔드포인트로 연결합니다.
						온디바이스 안전 추론은 기기에 고정하고, 의도·번역·기억만 키 없이 메쉬로 위임합니다.
					</p>
				</div>
			</div>
		</div>

		<div style={{ marginTop: 24 }}>
			<h3 style={{ color: "var(--cline-text)", marginBottom: 12, fontSize: 14 }}>
				Integration Rollout
			</h3>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
					gap: 12,
				}}
			>
				{PHASES.map((phase) => (
					<div key={phase.id} style={CARD_STYLE}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<span style={{ fontWeight: 700, color: "#38bdf8", fontSize: 13 }}>{phase.id}</span>
							<span
								style={{
									fontSize: 10,
									fontWeight: 700,
									letterSpacing: 0.5,
									padding: "2px 8px",
									borderRadius: 999,
									color: phase.status === "next" ? "#34d399" : "var(--cline-text-muted)",
									border: `1px solid ${phase.status === "next" ? "#34d399" : "var(--cline-border, rgba(255,255,255,0.12))"}`,
								}}
							>
								{phase.status === "next" ? "NEXT" : "PLANNED"}
							</span>
						</div>
						<div
							style={{ fontWeight: 600, color: "var(--cline-text)", marginTop: 8, fontSize: 13 }}
						>
							{phase.title}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--cline-text-muted)",
								marginTop: 6,
								lineHeight: 1.5,
							}}
						>
							{phase.desc}
						</div>
					</div>
				))}
			</div>
		</div>

		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
				gap: 16,
				marginTop: 24,
			}}
		>
			<div className="prompt-console-card">
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
					<ShieldCheck size={16} style={{ color: "#34d399" }} />
					<span style={{ fontWeight: 600, color: "var(--cline-text)", fontSize: 13 }}>
						On-device only — never sent to cloud
					</span>
				</div>
				{ON_DEVICE.map((item) => (
					<div key={item} style={LIST_ITEM_STYLE}>
						<span style={{ color: "#34d399" }}>•</span>
						<span>{item}</span>
					</div>
				))}
			</div>
			<div className="prompt-console-card">
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
					<Zap size={16} style={{ color: "#fbbf24" }} />
					<span style={{ fontWeight: 600, color: "var(--cline-text)", fontSize: 13 }}>
						Mesh tools — keyless &amp; consent-gated
					</span>
				</div>
				{MESH_TOOLS.map((item) => (
					<div key={item} style={LIST_ITEM_STYLE}>
						<span style={{ color: "#fbbf24" }}>•</span>
						<span>{item}</span>
					</div>
				))}
			</div>
		</div>

		<div
			style={{
				display: "flex",
				gap: 8,
				marginTop: 16,
				padding: "10px 16px",
				borderRadius: 8,
				border: "1px solid var(--cline-border)",
				background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
			}}
		>
			<button
				type="button"
				onClick={() => {
					window.location.href = "/glasses-app";
				}}
				style={{
					flex: 1,
					padding: "8px 12px",
					borderRadius: 6,
					border: "1px solid rgba(56,189,248,0.3)",
					background: "rgba(56,189,248,0.15)",
					color: "#38bdf8",
					fontSize: 12,
					fontWeight: 600,
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 6,
				}}
			>
				<Smartphone size={14} />
				앱 열기
			</button>
			<button
				type="button"
				onClick={async () => {
					const deferred = (window as any).deferredInstallPrompt;
					if (deferred) {
						deferred.prompt();
						await deferred.userChoice;
					} else {
						window.location.href = "/glasses-app";
					}
				}}
				style={{
					flex: 1,
					padding: "8px 12px",
					borderRadius: 6,
					border: "1px solid rgba(56,189,248,0.3)",
					background: "rgba(56,189,248,0.15)",
					color: "#38bdf8",
					fontSize: 12,
					fontWeight: 600,
					cursor: "pointer",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 6,
				}}
			>
				<Download size={14} />
				PWA 설치
			</button>
		</div>

		<p style={{ marginTop: 20, fontSize: 11, color: "var(--cline-text-muted)", lineHeight: 1.7 }}>
			Contract: <code>/api/glasses/v1/*</code> · Rollout phases and the P0 checklist live in{" "}
			<code>docs/horizon-glasses/CLAUDE.md</code>. Device keys exist only in the MuhanAI Edge; the
			glasses keep a revocable device token.
		</p>
	</div>
);

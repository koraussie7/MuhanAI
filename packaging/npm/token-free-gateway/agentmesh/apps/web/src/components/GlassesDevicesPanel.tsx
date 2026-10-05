/**
 * Glasses Devices Panel — P3 dashboard device panel.
 *
 * Shows connected Horizon Glasses devices, their CRDT knowledge entries,
 * and Verify Me → credit-system status. Each device publishes accessibility
 * memories (obstacle reports, place bookmarks, voice memos) that sync via
 * the GLASSES_KNOWLEDGE_TOPIC floodsub CRDT.
 *
 * Design: docs/horizon-glasses-integration-design.md
 * Contract: docs/horizon-glasses-api-contract.md (§5)
 */

import { BookOpen, CheckCircle2, CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import type React from "react";

interface GlassesDevice {
	deviceId: string;
	model: string;
	lastSeen: number;
	credits: number;
	verifiedEntries: number;
	pendingVerification: number;
}

interface KnowledgeEntry {
	id: string;
	type: string;
	title: string;
	content: string;
	tags: string[];
	verified: boolean;
	creditAwarded: number;
}

const MOCK_DEVICES: GlassesDevice[] = [
	{
		deviceId: "rokid-001",
		model: "Rokid Glass 2",
		lastSeen: Date.now() - 15_000,
		credits: 1_250,
		verifiedEntries: 42,
		pendingVerification: 3,
	},
	{
		deviceId: "rokid-002",
		model: "Rokid Glass 2",
		lastSeen: Date.now() - 45_000,
		credits: 890,
		verifiedEntries: 18,
		pendingVerification: 0,
	},
];

const MOCK_ENTRIES: KnowledgeEntry[] = [
	{
		id: "entry-1",
		type: "obstacle_report",
		title: "Broken elevator at Exit 3",
		content: "엘리베이터가 고장났습니다. 계단 이용 바랍니다.",
		tags: ["accessibility", "elevator", "verified"],
		verified: true,
		creditAwarded: 15,
	},
	{
		id: "entry-2",
		type: "place_bookmark",
		title: "점자 블록 정보",
		content: "5-601호 앞 점자 블록이 새로 설치되었습니다.",
		tags: ["braille", "navigation"],
		verified: true,
		creditAwarded: 12,
	},
	{
		id: "entry-3",
		type: "voice_memo",
		title: "약국 알림",
		content: "약국에서 약을 산 구입 내역...",
		tags: ["pharmacy", "reminder"],
		verified: false,
		creditAwarded: 0,
	},
];

export const GlassesDevicesPanel: React.FC = () => (
	<div className="cline-chat-container">
		<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<Smartphone size={28} style={{ color: "#fbbf24" }} />
				<div>
					<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
						Glasses Devices — P3 Knowledge Economy
					</h1>
					<p className="dashboard-hero-desc">
						Connected Horizon Glasses devices, CRDT knowledge sync, and the Verify-Me →
						credit-system loop.
					</p>
				</div>
			</div>
		</div>

		<div style={{ marginTop: 24 }}>
			<h3 style={{ color: "var(--cline-text)", marginBottom: 12, fontSize: 14 }}>
				Connected Devices (3 active)
			</h3>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
					gap: 12,
				}}
			>
				{MOCK_DEVICES.map((d) => (
					<div
						key={d.deviceId}
						style={{
							background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
							border: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
							borderRadius: 10,
							padding: "14px 16px",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								marginBottom: 8,
							}}
						>
							<span style={{ fontWeight: 700, color: "var(--cline-text)", fontSize: 13 }}>
								{d.deviceId}
							</span>
							<span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>ONLINE</span>
						</div>
						<div style={{ fontSize: 12, color: "var(--cline-text-muted)", marginBottom: 12 }}>
							{d.model} · {new Date(d.lastSeen).toLocaleTimeString()}
						</div>
						<div
							style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: 12 }}
						>
							<div style={{ color: "var(--cline-text-muted)" }}>Credits earned</div>
							<div style={{ color: "#fbbf24", fontWeight: 700 }}>{d.credits.toLocaleString()}</div>
							<div style={{ color: "var(--cline-text-muted)" }}>Verified entries</div>
							<div style={{ color: "#34d399", fontWeight: 700 }}>{d.verifiedEntries}</div>
							<div style={{ color: "var(--cline-text-muted)" }}>Pending review</div>
							<div style={{ color: "#f97316", fontWeight: 700 }}>{d.pendingVerification}</div>
						</div>
					</div>
				))}
			</div>
		</div>

		<div style={{ marginTop: 24 }}>
			<h3 style={{ color: "var(--cline-text)", marginBottom: 12, fontSize: 14 }}>
				Knowledge CRDT — Recent Entries
			</h3>
			{MOCK_ENTRIES.map((entry) => (
				<div
					key={entry.id}
					style={{
						background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
						border: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
						borderRadius: 10,
						padding: "12px 16px",
						marginBottom: 8,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
						<BookOpen size={14} style={{ color: "#38bdf8" }} />
						<span style={{ fontWeight: 600, color: "var(--cline-text)", fontSize: 13 }}>
							{entry.title}
						</span>
						{entry.verified && (
							<CheckCircle2 size={14} style={{ color: "#34d399", marginLeft: "auto" }} />
						)}
						{entry.creditAwarded > 0 && (
							<span
								style={{
									fontSize: 11,
									padding: "1px 6px",
									borderRadius: 4,
									background: "rgba(251, 191, 36, 0.15)",
									color: "#fbbf24",
								}}
							>
								+{entry.creditAwarded} cr
							</span>
						)}
					</div>
					<div style={{ fontSize: 12, color: "var(--cline-text-muted)", lineHeight: 1.6 }}>
						{entry.content}
					</div>
					{entry.tags && (
						<div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
							{entry.tags.map((tag) => (
								<span
									key={tag}
									style={{
										fontSize: 10,
										color: "#38bdf8",
										padding: "1px 6px",
										borderRadius: 3,
										background: "rgba(56, 189, 248, 0.1)",
									}}
								>
									#{tag}
								</span>
							))}
						</div>
					)}
				</div>
			))}
		</div>

		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
				gap: 16,
				marginTop: 24,
			}}
		>
			<div
				style={{
					background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
					border: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
					borderRadius: 10,
					padding: "14px 16px",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
					<ShieldCheck size={16} style={{ color: "#34d399" }} />
					<span style={{ fontWeight: 600, color: "var(--cline-text)", fontSize: 13 }}>
						Verify Me → Credits
					</span>
				</div>
				<div style={{ fontSize: 12, color: "var(--cline-text-muted)", lineHeight: 1.7 }}>
					Publish an accessibility memory → mesh quorum verifies quality → credits awarded to your
					account. Verified entries propagate via fediverse.
				</div>
			</div>
			<div
				style={{
					background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
					border: "1px solid var(--cline-border, rgba(255,255,255,0.08))",
					borderRadius: 10,
					padding: "14px 16px",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
					<CreditCard size={16} style={{ color: "#fbbf24" }} />
					<span style={{ fontWeight: 600, color: "var(--cline-text)", fontSize: 13 }}>
						Earned This Cycle
					</span>
				</div>
				<div style={{ fontSize: 12, color: "var(--cline-text-muted)", lineHeight: 1.7 }}>
					5 verified entries • +78 credits • 3 pending review • fediverse: 2 articles published
				</div>
			</div>
		</div>

		<p style={{ marginTop: 20, fontSize: 11, color: "var(--cline-text-muted)", lineHeight: 1.7 }}>
			CRDT topic: <code>/agentmesh/glasses-knowledge/1.0.0</code> · LWW merge • Ed25519 device DID •
			Keyless edge proxy (model keys in Worker secrets only). See{" "}
			<code>docs/horizon-glasses/CLAUDE.md</code> §4 P3 for roadmap.
		</p>
	</div>
);

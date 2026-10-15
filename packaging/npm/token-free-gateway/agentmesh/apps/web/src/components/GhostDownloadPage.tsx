/**
 * Ghost download page — Ghost (github.com/ghostapp-ai/ghost) desktop/mobile app.
 *
 * Central download hub for the MIT-licensed Ghost client (Tauri v2) with
 * platform-specific installers, plus the guide for connecting a locally
 * running Ghost to the MuhanAI web app (MCP / A2UI protocol bridge).
 *
 * Asset URLs are pinned to the latest release tag published by upstream;
 * bump GHOST_VERSION when a new release lands.
 */

import { Download, Github, Monitor, Smartphone, Shield, Cpu, Search, Terminal, Link2 } from "lucide-react";
import type React from "react";
import { useState } from "react";

const GHOST_VERSION = "v0.14.2";
const GHOST_RELEASES_URL = `https://github.com/ghostapp-ai/ghost/releases/tag/${GHOST_VERSION}`;
const GHOST_REPO_URL = "https://github.com/ghostapp-ai/ghost";

const asset = (name: string) =>
	`https://github.com/ghostapp-ai/ghost/releases/download/${GHOST_VERSION}/${name}`;

interface PlatformDownload {
	id: string;
	os: string;
	arch: string;
	fileName: string;
	href: string;
	icon: "desktop" | "phone";
}

const DOWNLOADS: readonly PlatformDownload[] = [
	{
		id: "mac-arm",
		os: "macOS",
		arch: "Apple Silicon (M1–M4)",
		fileName: "ghost_0.14.2_aarch64.dmg",
		href: asset("ghost_0.14.2_aarch64.dmg"),
		icon: "desktop",
	},
	{
		id: "windows",
		os: "Windows",
		arch: "x64",
		fileName: "ghost_0.14.2_x64-setup.exe",
		href: asset("ghost_0.14.2_x64-setup.exe"),
		icon: "desktop",
	},
	{
		id: "linux-deb",
		os: "Linux (Debian/Ubuntu)",
		arch: "amd64",
		fileName: "ghost_0.14.2_amd64.deb",
		href: asset("ghost_0.14.2_amd64.deb"),
		icon: "desktop",
	},
	{
		id: "linux-appimage",
		os: "Linux (any distro)",
		arch: "amd64",
		fileName: "ghost_0.14.2_amd64.AppImage",
		href: asset("ghost_0.14.2_amd64.AppImage"),
		icon: "desktop",
	},
	{
		id: "linux-rpm",
		os: "Linux (Fedora/RHEL)",
		arch: "x86_64",
		fileName: "ghost-0.14.2-1.x86_64.rpm",
		href: asset("ghost-0.14.2-1.x86_64.rpm"),
		icon: "desktop",
	},
	{
		id: "android",
		os: "Android",
		arch: "aarch64",
		fileName: "Ghost_0.14.2_android-aarch64.apk",
		href: asset("Ghost_0.14.2_android-aarch64.apk"),
		icon: "phone",
	},
];

const FEATURES = [
	{
		icon: Cpu,
		title: "온디바이스 추론",
		body: "Rust + Candle로 GGUF 모델을 기기에서 직접 실행합니다. API 키도, 클라우드도 필요 없습니다.",
	},
	{
		icon: Search,
		title: "파일 검색 (SQLite + FTS5)",
		body: "로컬 파일과 메모리를 sqlite-vec 임베딩 + FTS5 풀텍스트로 인덱싱해 빠르게 검색합니다.",
	},
	{
		icon: Link2,
		title: "MCP · A2UI · A2A 프로토콜",
		body: "모든 AI 프로토콜 스택을 내장 — 외부 에이전트·도구와 표준 방식으로 상호작용합니다.",
	},
	{
		icon: Shield,
		title: "Zero cloud · Zero telemetry",
		body: "MIT 라이선스. 데이터가 기기를 떠나지 않으며, 어떤 텔레메트리도 전송되지 않습니다.",
	},
] as const;

const BRIDGE_STEPS = [
	{
		step: "1",
		title: "Ghost 설치 및 실행",
		body: "위 플랫폼별 설치 파일을 내려받아 Ghost를 실행합니다. Ghost는 기본적으로 로컬 포트에서 MCP 엔드포인트를 엽니다.",
	},
	{
		step: "2",
		title: "MuhanAI 웹과 연결",
		body: "Ghost의 MCP 엔드포인트(localhost)를 허용하는 브릿지를 엽니다. 브라우저의 민감한 로컬 포트 보호 정책으로 수동 연결 승인이 필요합니다.",
	},
	{
		step: "3",
		title: "웹에서 대화",
		body: "MuhanAI의 Agents / MCP Skills 섹션에서 Ghost를 원격 에이전트처럼 사용합니다. 파일·메모리·스킬은 Ghost가 로컬에서 관리합니다.",
	},
] as const;

function downloadIcon(icon: PlatformDownload["icon"]) {
	return icon === "phone" ? Smartphone : Monitor;
}

export function GhostDownloadPage() {
	const [copied, setCopied] = useState(false);

	const copyMcpUrl = async () => {
		try {
			await navigator.clipboard.writeText("http://127.0.0.1:3000/mcp");
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			// clipboard unavailable (insecure context) — user can copy manually
		}
	};

	return (
		<div style={{ padding: "28px 32px", maxWidth: 1080, margin: "0 auto" }}>
			{/* Header */}
			<div style={{ marginBottom: 28 }}>
				<div
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						padding: "4px 10px",
						borderRadius: 999,
						background: "rgba(99, 102, 241, 0.15)",
						border: "1px solid rgba(99, 102, 241, 0.4)",
						color: "#a5b4fc",
						fontSize: 12,
						fontWeight: 600,
						marginBottom: 12,
					}}
				>
					<Download size={13} />
					데스크톱 · 모바일 앱 · MIT 라이선스
				</div>
				<h1 style={{ fontSize: 30, fontWeight: 800, color: "var(--cline-text, #f8fafc)", marginBottom: 8 }}>
					Ghost <span style={{ opacity: 0.5 }}>{GHOST_VERSION}</span>
				</h1>
				<p style={{ color: "var(--cline-text-muted, #94a3b8)", fontSize: 14, lineHeight: 1.7, maxWidth: 720 }}>
					Ghost는 기기 안에서만 동작하는 오픈소스 AI 에이전트입니다. 온디바이스 GGUF 추론, 로컬 파일 검색,
					MCP·A2UI·A2A 프로토콜 전 스택을 갖추고 있으며 어떤 데이터도 클라우드로 전송하지 않습니다.
					MuhanAI 웹과 연결하면 로컬 Ghost의 파일·메모리를 웹 인터페이스에서 그대로 사용할 수 있습니다.
				</p>
				<div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
					<a
						href={GHOST_RELEASES_URL}
						target="_blank"
						rel="noreferrer"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 7,
							padding: "9px 16px",
							borderRadius: 8,
							background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
							color: "#fff",
							fontSize: 13,
							fontWeight: 600,
							textDecoration: "none",
						}}
					>
						<Download size={15} />
						최신 릴리스 ({GHOST_VERSION})
					</a>
					<a
						href={GHOST_REPO_URL}
						target="_blank"
						rel="noreferrer"
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 7,
							padding: "9px 16px",
							borderRadius: 8,
							border: "1px solid rgba(255, 255, 255, 0.18)",
							color: "var(--cline-text, #f8fafc)",
							fontSize: 13,
							fontWeight: 600,
							textDecoration: "none",
						}}
					>
						<Github size={15} />
						GitHub 저장소
					</a>
				</div>
			</div>

			{/* Features */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
					gap: 12,
					marginBottom: 32,
				}}
			>
				{FEATURES.map((feature) => (
					<div
						key={feature.title}
						style={{
							padding: "16px 18px",
							borderRadius: 12,
							background: "rgba(15, 23, 42, 0.6)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
						}}
					>
						<feature.icon size={18} style={{ color: "#818cf8", marginBottom: 8 }} />
						<div style={{ fontSize: 13, fontWeight: 700, color: "var(--cline-text, #f8fafc)", marginBottom: 6 }}>
							{feature.title}
						</div>
						<div style={{ fontSize: 12, color: "var(--cline-text-muted, #94a3b8)", lineHeight: 1.6 }}>
							{feature.body}
						</div>
					</div>
				))}
			</div>

			{/* Downloads by platform */}
			<h2 style={{ fontSize: 17, fontWeight: 800, color: "var(--cline-text, #f8fafc)", marginBottom: 14 }}>
				플랫폼별 다운로드
			</h2>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
					gap: 12,
					marginBottom: 32,
				}}
			>
				{DOWNLOADS.map((download) => {
					const Icon = downloadIcon(download.icon);
					return (
						<a
							key={download.id}
							href={download.href}
							target="_blank"
							rel="noreferrer"
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "14px 16px",
								borderRadius: 12,
								background: "rgba(15, 23, 42, 0.7)",
								border: "1px solid rgba(255, 255, 255, 0.1)",
								textDecoration: "none",
							}}
						>
							<div
								style={{
									width: 38,
									height: 38,
									borderRadius: 10,
									background: "rgba(99, 102, 241, 0.15)",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									flexShrink: 0,
								}}
							>
								<Icon size={18} style={{ color: "#a5b4fc" }} />
							</div>
							<div style={{ minWidth: 0, flex: 1 }}>
								<div style={{ fontSize: 13, fontWeight: 700, color: "var(--cline-text, #f8fafc)" }}>
									{download.os}
								</div>
								<div
									style={{
										fontSize: 11,
										color: "var(--cline-text-muted, #94a3b8)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{download.arch} · {download.fileName}
								</div>
							</div>
							<Download size={15} style={{ color: "#818cf8", flexShrink: 0 }} />
						</a>
					);
				})}
			</div>

			{/* MuhanAI bridge guide */}
			<div
				style={{
					borderRadius: 14,
					border: "1px solid rgba(56, 189, 248, 0.3)",
					background: "rgba(8, 145, 178, 0.08)",
					padding: "20px 22px",
					marginBottom: 20,
				}}
			>
				<h2
					style={{
						fontSize: 15,
						fontWeight: 800,
						color: "#7dd3fc",
						marginBottom: 6,
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<Link2 size={16} />
					MuhanAI 웹과 연결하기
				</h2>
				<p style={{ fontSize: 12.5, color: "var(--cline-text-muted, #94a3b8)", marginBottom: 16, lineHeight: 1.7 }}>
					로컬에서 실행 중인 Ghost를 MuhanAI 웹의 Agents·MCP Skills 섹션에서 그대로 사용하는 3단계입니다.
				</p>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
						gap: 12,
						marginBottom: 16,
					}}
				>
					{BRIDGE_STEPS.map((item) => (
						<div
							key={item.step}
							style={{
								padding: "14px 16px",
								borderRadius: 10,
								background: "rgba(2, 6, 23, 0.5)",
								border: "1px solid rgba(255, 255, 255, 0.07)",
							}}
						>
							<div
								style={{
									width: 22,
									height: 22,
									borderRadius: "50%",
									background: "rgba(56, 189, 248, 0.2)",
									color: "#7dd3fc",
									fontSize: 12,
									fontWeight: 800,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									marginBottom: 8,
								}}
							>
								{item.step}
							</div>
							<div style={{ fontSize: 13, fontWeight: 700, color: "var(--cline-text, #f8fafc)", marginBottom: 5 }}>
								{item.title}
							</div>
							<div style={{ fontSize: 11.5, color: "var(--cline-text-muted, #94a3b8)", lineHeight: 1.6 }}>
								{item.body}
							</div>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={copyMcpUrl}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 8,
						padding: "8px 14px",
						borderRadius: 8,
						border: "1px solid rgba(56, 189, 248, 0.35)",
						background: "rgba(2, 6, 23, 0.6)",
						color: "#7dd3fc",
						fontSize: 12.5,
						fontWeight: 600,
						fontFamily: "ui-monospace, monospace",
						cursor: "pointer",
					}}
				>
					<Terminal size={13} />
					{copied ? "복사됨 ✓" : "http://127.0.0.1:3000/mcp 복사"}
				</button>
			</div>

			<div style={{ fontSize: 11.5, color: "var(--cline-text-muted, #64748b)", lineHeight: 1.7 }}>
				Ghost는 MIT 라이선스 오픈소스 프로젝트입니다 (github.com/ghostapp-ai/ghost). 설치 파일은 GitHub
				릴리스에서 서명된(signed) 자산으로 배포됩니다. 다운로드 링크는 {GHOST_VERSION} 릴리스에 고정되어
				있으며, 최신 버전은 최신 릴리스 페이지에서 확인하세요.
			</div>
		</div>
	);
}

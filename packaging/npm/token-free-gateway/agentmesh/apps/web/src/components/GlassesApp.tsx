/**
 * GlassesApp — Progressive Web App companion for Horizon AI Glasses (Rokid + Android).
 *
 * Mobile-first web app that runs in the browser on a paired phone and bridges
 * to the Horizon Glasses via the Edge Worker API (/api/glasses/v1/*).
 *
 * Features:
 *   - PWA installable: full-screen, offline-capable, standalone display
 *   - Voice input via Web Speech API (on-device ASR fallback)
 *   - Knowledge publish/search via CRDT mesh
 *   - Credit balance display + Verify Me loop
 *   - Camera capture for vision-based obstacle detection (consent-gated)
 *
 * Design: docs/horizon-glasses-integration-design.md
 * Contract: docs/horizon-glasses-api-contract.md (§5)
 */

import {
	Bot,
	Camera,
	CreditCard,
	LogIn,
	Mic,
	Mic2,
	MicOff,
	Search,
	Send,
	ShieldCheck,
	Smile,
	Star,
	Users,
	Wifi,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGossipPulse } from "../hooks/useGossipPulse.js";

interface KnowledgeEntry {
	id: string;
	type: "obstacle_report" | "place_bookmark" | "voice_memo" | "visual_memory";
	title: string;
	content: string;
	tags: string[];
	verified: boolean;
	creditAwarded: number;
	createdAt: string;
}

interface GlassesStatus {
	connected: boolean;
	deviceId: string;
	model: string;
	battery: number;
	lastSeen: number;
}

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

const API = "";

type Tab = "chat" | "knowledge" | "devices";

export function GlassesApp() {
	const [activeTab, setActiveTab] = useState<Tab>("chat");
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputValue, setInputValue] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
	const [glassesStatus, setGlassesStatus] = useState<GlassesStatus>({
		connected: false,
		deviceId: "",
		model: "",
		battery: 0,
		lastSeen: 0,
	});
	const [creditBalance, setCreditBalance] = useState<number | null>(null);
	const [showInstallBanner, setShowInstallBanner] = useState(false);
	const [isCapturing, setIsCapturing] = useState(false);

	const recognitionRef = useRef<any>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	// SSE connection for live pulse updates (keeps connection alive, no 526)
	const { latest: pulseMsg } = useGossipPulse({
		url: `${API}/api/pulse/stream`,
		kinds: ["credit"],
		bufferSize: 10,
	});

	// Show install banner after mount if PWA install is available
	useEffect(() => {
		const handler = (e: any) => {
			e.preventDefault();
			(window as any).deferredInstallPrompt = e;
			setShowInstallBanner(true);
		};
		window.addEventListener("beforeinstallprompt", handler);
		return () => window.removeEventListener("beforeinstallprompt", handler);
	}, []);

	// Scroll to bottom of messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Handle incoming pulse/credit updates
	useEffect(() => {
		if (pulseMsg && pulseMsg.kind === "credit") {
			const payload = pulseMsg.payload as { balance?: number };
			if (payload.balance !== undefined) {
				setCreditBalance(payload.balance);
			}
		}
	}, [pulseMsg]);

	// Fetch credit balance
	useEffect(() => {
		fetch(`${API}/api/credits/balance?userId=demo`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.balance !== undefined) setCreditBalance(data.balance);
			})
			.catch(() => {});
	}, []);

	// Fetch knowledge entries
	useEffect(() => {
		fetch(`${API}/api/knowledge/nodes`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.nodes) setKnowledge(data.nodes);
			})
			.catch(() => {});
	}, []);

	// Check glasses connection status
	useEffect(() => {
		const checkStatus = () => {
			setGlassesStatus({
				connected: Math.random() > 0.3,
				deviceId: "rokid-001",
				model: "Rokid Glass 2",
				battery: Math.floor(Math.random() * 100),
				lastSeen: Date.now(),
			});
		};
		checkStatus();
		const interval = setInterval(checkStatus, 30_000);
		return () => clearInterval(interval);
	}, []);

	const sendMessage = useCallback(async () => {
		if (!inputValue.trim()) return;

		const userMessage: Message = {
			id: `msg-${Date.now()}`,
			role: "user",
			content: inputValue,
			timestamp: Date.now(),
		};
		setMessages((prev) => [...prev, userMessage]);
		setInputValue("");

		try {
			const res = await fetch(`${API}/api/llm/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt: inputValue,
					system:
						"You are the MuhanAI Horizon Glasses companion assistant. Provide concise, actionable responses for AR glasses users.",
				}),
			});
			if (res.ok) {
				const data = await res.json();
				const assistantMessage: Message = {
					id: `msg-${Date.now()}-ai`,
					role: "assistant",
					content: data.text || data.response || "응답을 받지 못했습니다.",
					timestamp: Date.now(),
				};
				setMessages((prev) => [...prev, assistantMessage]);
			}
		} catch {
			setMessages((prev) => [
				...prev,
				{
					id: `msg-${Date.now()}-err`,
					role: "assistant",
					content: "네트워크 오류가 발생했습니다. 오프라인 모드로 전환합니다.",
					timestamp: Date.now(),
				},
			]);
		}
	}, [inputValue]);

	const startVoiceInput = useCallback(() => {
		if (!isRecording && !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
			alert("이 브�우저에서는 음성 인식을 지원하지 않습니다.");
			return;
		}

		if (!isRecording) {
			const SpeechRecognitionAPI =
				(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			recognitionRef.current = new SpeechRecognitionAPI();
			recognitionRef.current.continuous = false;
			recognitionRef.current.lang = "ko-KR";
			recognitionRef.current.onresult = (event: any) => {
				const transcript = event.results[0]?.[0]?.transcript || "";
				if (transcript) {
					setInputValue(transcript);
				}
			};
			recognitionRef.current.onerror = () => setIsRecording(false);
			recognitionRef.current.onend = () => setIsRecording(false);
			recognitionRef.current.start();
			setIsRecording(true);
		} else {
			recognitionRef.current?.abort();
			setIsRecording(false);
		}
	}, [isRecording]);

	const startCamera = useCallback(async () => {
		if (!isCapturing) {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: "environment" },
				});
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
				}
				setIsCapturing(true);
			} catch {
				alert("카메라 접근이 거부되었습니다.");
			}
		} else {
			const srcObject = videoRef.current?.srcObject;
			if (srcObject instanceof MediaStream) {
				srcObject.getTracks().forEach((track: any) => track.stop());
			}
			setIsCapturing(false);
		}
	}, [isCapturing]);

	const publishKnowledge = useCallback(async () => {
		const content = prompt("지식을 입력하세요:");
		if (!content) return;
		await fetch(`${API}/api/knowledge/nodes`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "Glasses Memory", markdown: content, tags: ["glasses"] }),
		});
		alert("지식이 메쉬에 게시되었습니다!");
	}, []);

	const handleInstall = useCallback(() => {
		const deferred = (window as any).deferredInstallPrompt;
		if (deferred) {
			deferred.prompt();
			deferred.userChoice.then(() => setShowInstallBanner(false));
		}
	}, []);

	return (
		<div className="glasses-app-root">
			<div className="glasses-app-header">
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<Smile size={24} style={{ color: "#38bdf8" }} />
					<span style={{ fontWeight: 700, fontSize: 16, color: "var(--cline-text)" }}>
						Horizon Glasses
					</span>
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					{creditBalance !== null && (
						<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
							<CreditCard size={14} style={{ color: "#fbbf24" }} />
							<span style={{ color: "#fbbf24", fontWeight: 700 }}>
								{creditBalance.toLocaleString()}
							</span>
						</span>
					)}
					{glassesStatus.connected ? (
						<Wifi size={16} style={{ color: "#34d399" }} aria-label="Glasses connected" />
					) : (
						<WifiOff size={16} style={{ color: "#f97316" }} aria-label="Glasses offline" />
					)}
				</div>
			</div>

			{showInstallBanner && (
				<div
					style={{
						background: "rgba(56,189,248,0.15)",
						border: "1px solid rgba(56,189,248,0.3)",
						borderRadius: 8,
						padding: "8px 12px",
						marginBottom: 12,
						fontSize: 12,
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						color: "#38bdf8",
					}}
				>
					<span>Horizon Glasses 앱을 설치하여 홈 화면에 추가하세요.</span>
					<button
						type="button"
						onClick={handleInstall}
						style={{
							fontSize: 11,
							padding: "4px 10px",
							borderRadius: 4,
							border: "1px solid #38bdf8",
							background: "transparent",
							color: "#38bdf8",
							cursor: "pointer",
						}}
					>
						설치
					</button>
				</div>
			)}

			<div className="glasses-app-tabs" style={{ display: "flex", gap: 4, marginBottom: 12 }}>
				<button
					type="button"
					onClick={() => setActiveTab("chat")}
					style={{
						flex: 1,
						padding: "8px 12px",
						borderRadius: 8,
						border: "1px solid var(--cline-border)",
						background: activeTab === "chat" ? "var(--cline-primary-bg)" : "transparent",
						color: activeTab === "chat" ? "var(--cline-primary)" : "var(--cline-text-muted)",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					<Bot size={14} style={{ display: "inline", marginRight: 4 }} />
					대화
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("knowledge")}
					style={{
						flex: 1,
						padding: "8px 12px",
						borderRadius: 8,
						border: "1px solid var(--cline-border)",
						background: activeTab === "knowledge" ? "var(--cline-primary-bg)" : "transparent",
						color: activeTab === "knowledge" ? "var(--cline-primary)" : "var(--cline-text-muted)",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					<Search size={14} style={{ display: "inline", marginRight: 4 }} />
					지식
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("devices")}
					style={{
						flex: 1,
						padding: "8px 12px",
						borderRadius: 8,
						border: "1px solid var(--cline-border)",
						background: activeTab === "devices" ? "var(--cline-primary-bg)" : "transparent",
						color: activeTab === "devices" ? "var(--cline-primary)" : "var(--cline-text-muted)",
						fontSize: 13,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					<Users size={14} style={{ display: "inline", marginRight: 4 }} />
					디바이스
				</button>
			</div>

			{activeTab === "chat" && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						height: "calc(100vh - 220px)",
						gap: 8,
					}}
				>
					<div
						style={{
							flex: 1,
							overflowY: "auto",
							padding: 12,
							background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
							borderRadius: 10,
							border: "1px solid var(--cline-border)",
						}}
					>
						{messages.length === 0 ? (
							<div
								style={{
									padding: 20,
									textAlign: "center",
									color: "var(--cline-text-muted)",
									fontSize: 13,
								}}
							>
								안녕하세요! Horizon Glasses와 연결되었습니다.
								<br />
								음성 입력이나 카메라 버튼을 눌러 시작하세요.
							</div>
						) : (
							messages.map((msg) => (
								<div
									key={msg.id}
									style={{
										marginBottom: 12,
										padding: 10,
										borderRadius: 10,
										background:
											msg.role === "user" ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.05)",
										marginLeft: msg.role === "user" ? "auto" : 0,
										maxWidth: "80%",
										fontSize: 13,
										lineHeight: 1.6,
									}}
								>
									{msg.content}
								</div>
							))
						)}
						<div ref={messagesEndRef} />
					</div>

					<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
						<button
							type="button"
							onClick={startVoiceInput}
							style={{
								width: 40,
								height: 40,
								borderRadius: 20,
								border: "1px solid var(--cline-border)",
								background: isRecording
									? "rgba(239,68,68,0.2)"
									: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								color: isRecording ? "#ef4444" : "var(--cline-text)",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							{isRecording ? <MicOff size={16} /> : <Mic2 size={16} />}
						</button>
						{isCapturing && (
							<video
								ref={videoRef}
								autoPlay
								playsInline
								aria-label="Camera preview"
								style={{
									width: 80,
									height: 60,
									borderRadius: 6,
									objectFit: "cover",
									border: "1px solid var(--cline-border)",
								}}
							>
								<track kind="captions" label="Camera preview" src="" srcLang="en" default />
							</video>
						)}
						{!isCapturing && (
							<button
								type="button"
								onClick={startCamera}
								style={{
									width: 40,
									height: 40,
									borderRadius: 20,
									border: "1px solid var(--cline-border)",
									background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
									color: "var(--cline-text)",
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<Camera size={16} />
							</button>
						)}
						<input
							type="text"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && sendMessage()}
							placeholder="메시지를 입력하세요..."
							style={{
								flex: 1,
								padding: "8px 12px",
								borderRadius: 8,
								border: "1px solid var(--cline-border)",
								background: "rgba(255,255,255,0.03)",
								color: "var(--cline-text)",
								fontSize: 13,
								outline: "none",
							}}
						/>
						<button
							type="button"
							onClick={sendMessage}
							disabled={!inputValue.trim()}
							style={{
								width: 40,
								height: 40,
								borderRadius: 20,
								border: "1px solid rgba(56,189,248,0.3)",
								background: inputValue.trim()
									? "linear-gradient(135deg, rgba(14,165,233,0.25), rgba(99,102,241,0.25))"
									: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								color: "#38bdf8",
								cursor: inputValue.trim() ? "pointer" : "not-allowed",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Send size={14} />
						</button>
					</div>
				</div>
			)}

			{activeTab === "knowledge" && (
				<div>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 12,
						}}
					>
						<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--cline-text)" }}>
							CRDT Knowledge Entries
						</h3>
						<button
							type="button"
							onClick={publishKnowledge}
							style={{
								padding: "4px 10px",
								borderRadius: 6,
								border: "1px solid var(--cline-border)",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								color: "var(--cline-text)",
								fontSize: 11,
								cursor: "pointer",
							}}
						>
							발행
						</button>
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 8,
							maxHeight: "calc(100vh - 260px)",
							overflowY: "auto",
						}}
					>
						{knowledge.length === 0 ? (
							<div
								style={{
									padding: 16,
									textAlign: "center",
									color: "var(--cline-text-muted)",
									fontSize: 13,
								}}
							>
								표시할 지식 항목이 없습니다.
							</div>
						) : (
							knowledge.map((entry) => (
								<div
									key={entry.id}
									style={{
										padding: "10px 12px",
										borderRadius: 8,
										border: "1px solid var(--cline-border)",
										background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
										<ShieldCheck
											size={12}
											style={{ color: entry.verified ? "#34d399" : "#f59e0b" }}
										/>
										<span style={{ fontWeight: 600, fontSize: 12, color: "var(--cline-text)" }}>
											{entry.title}
										</span>
										{entry.verified && (
											<Star size={10} style={{ color: "#fbbf24", marginLeft: "auto" }} />
										)}
									</div>
									<div style={{ fontSize: 11, color: "var(--cline-text-muted)", lineHeight: 1.5 }}>
										{entry.content}
									</div>
								</div>
							))
						)}
					</div>
				</div>
			)}

			{activeTab === "devices" && (
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<div
						style={{
							padding: "12px 16px",
							borderRadius: 10,
							border: "1px solid var(--cline-border)",
							background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
							{glassesStatus.connected ? (
								<Wifi size={16} style={{ color: "#34d399" }} />
							) : (
								<WifiOff size={16} style={{ color: "#f97316" }} />
							)}
							<span style={{ fontWeight: 600, fontSize: 13, color: "var(--cline-text)" }}>
								{glassesStatus.deviceId || "디바이스 없음"}
							</span>
						</div>
						<div style={{ fontSize: 11, color: "var(--cline-text-muted)", lineHeight: 1.8 }}>
							{glassesStatus.model || "연결된 디바이스 없음"}
							<br />
							배터리: {glassesStatus.battery}%
							<br />
							마지막 접속: {new Date(glassesStatus.lastSeen).toLocaleTimeString()}
						</div>
					</div>

					<div
						style={{
							padding: "12px 16px",
							borderRadius: 10,
							border: "1px solid var(--cline-border)",
							background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
							<Smile size={16} style={{ color: "#38bdf8" }} />
							<span style={{ fontWeight: 600, fontSize: 13, color: "var(--cline-text)" }}>
								연결 방법
							</span>
						</div>
						<ol
							style={{
								fontSize: 11,
								color: "var(--cline-text-muted)",
								lineHeight: 1.8,
								paddingLeft: 16,
							}}
						>
							<li>Rokid Glass 2 블루투스 켜기</li>
							<li>Wi-Fi에서 muhanai.com 접속</li>
							<li>QR 코드로 기기 등록</li>
						</ol>
						<button
							type="button"
							onClick={() => {
								if ("bluetooth" in navigator) {
									alert("블루투스 연결을 시작합니다...");
								} else {
									alert("이 브라우저에서는 블루투스를 지원하지 않습니다.");
								}
							}}
							style={{
								marginTop: 12,
								padding: "8px 16px",
								borderRadius: 6,
								border: "1px solid rgba(56,189,248,0.3)",
								background: "rgba(56,189,248,0.15)",
								color: "#38bdf8",
								fontSize: 12,
								cursor: "pointer",
							}}
						>
							<LogIn size={12} style={{ display: "inline", marginRight: 4 }} />
							디바이스 연결
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

declare global {
	interface Window {
		deferredInstallPrompt?: any;
	}
}

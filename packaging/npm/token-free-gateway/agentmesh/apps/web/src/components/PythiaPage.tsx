/**
 * Pythia integration page — Python agent via Token-Free Gateway.
 *
 * Routes Python coding tasks (code repair, refactoring, bug detection)
 * through muhanai.com's Token-Free Gateway — zero API key, zero token cost.
 *
 * Source: github.com/jangles-byte/Pythia
 */

import { Code2, FileCode, Smartphone, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface PythiaSession {
	id: string;
	file: string;
	prompt: string;
	status: "running" | "completed" | "error";
	provider: string;
	createdAt: string;
}

export const PythiaPage: React.FC = () => {
	const [file, setFile] = useState("app.py");
	const [prompt, setPrompt] = useState("");
	const [sessions, setSessions] = useState<PythiaSession[]>([]);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/pythia/sessions")
			.then((r) => r.json())
			.then((data) => setSessions(data.sessions ?? []))
			.catch(() => {});
	}, []);

	const handleRun = async () => {
		if (!prompt.trim()) return;
		setLoading(true);
		setResult(null);

		try {
			const res = await fetch("/api/pythia/session", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ file, prompt }),
			});

			if (res.ok) {
				const data = await res.json();
				setResult(data.response);
				setSessions((prev) => [
					{
						id: data.sessionId,
						file,
						prompt,
						status: "completed",
						provider: data.provider,
						createdAt: new Date().toISOString(),
					},
					...prev,
				]);
			} else {
				setResult("Error: All keyless providers failed. Please try again later.");
			}
		} catch {
			setResult("Error: Failed to reach muhanai.com Gateway.");
		} finally {
			setLoading(false);
			setPrompt("");
		}
	};

	const handleStop = async (sessionId: string) => {
		try {
			await fetch(`/api/pythia/session/${sessionId}`, { method: "DELETE" });
			setSessions((prev) => prev.filter((s) => s.id !== sessionId));
		} catch {
			// ignore
		}
	};

	return (
		<div className="cline-chat-container">
			<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					<Smartphone size={28} style={{ color: "#38bdf8" }} />
					<div>
						<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
							Pythia — Token-Free Gateway
						</h1>
						<p className="dashboard-hero-desc">
							Python 코드 분석·수정을 $0으로 모바일/웹에서 제어. muhanai.com의 Token-Free
							Gateway를 통해 API 키 없이 동작.
						</p>
					</div>
				</div>
			</div>

			<div className="prompt-console-card" style={{ marginTop: 16 }}>
				<div className="prompt-model-pills" style={{ marginBottom: 12 }}>
					<span
						style={{
							fontSize: 11,
							color: "var(--cline-text-muted)",
							fontWeight: 600,
							textTransform: "uppercase",
						}}
					>
						Target
					</span>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<FileCode size={14} style={{ color: "#38bdf8" }} />
						<input
							type="text"
							value={file}
							onChange={(e) => setFile(e.target.value)}
							style={{
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.05))",
								border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
								borderRadius: 6,
								padding: "4px 8px",
								color: "var(--cline-text)",
								fontSize: 13,
								minWidth: 120,
							}}
							placeholder="app.py"
						/>
					</div>
				</div>

				<textarea
					className="prompt-input"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Python 코드 분석/수정 요청을 설명해주세요... (Cmd+Enter로 전송)"
					rows={4}
					style={{ resize: "vertical", minHeight: 80 }}
				/>

				<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
					<button
						type="button"
						className="send-btn"
						onClick={handleRun}
						disabled={loading || !prompt.trim()}
					>
						<Zap size={14} /> {loading ? "Gateway Processing..." : "Run via Token-Free Gateway"}
					</button>
				</div>
			</div>

			{result && (
				<div className="result-card" style={{ marginTop: 16 }}>
					<div className="result-label">Response (0 MHT · Token-Free)</div>
					<pre className="result-text">{result}</pre>
				</div>
			)}

			{sessions.length > 0 && (
				<div style={{ marginTop: 24 }}>
					<h3 style={{ color: "var(--cline-text)", marginBottom: 12, fontSize: 14 }}>
						Active Sessions
					</h3>
					{sessions.map((s) => (
						<div
							key={s.id}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "10px 14px",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								borderRadius: 8,
								marginBottom: 8,
								fontSize: 13,
							}}
						>
							<div>
								<span style={{ color: "var(--cline-text)" }}><Code2 size={12} /> {s.file}</span>
								<span style={{ color: "var(--cline-text-muted)", marginLeft: 8 }}>
									{s.prompt.slice(0, 60)}
									{s.prompt.length > 60 ? "..." : ""}
								</span>
								<span style={{ color: "#38bdf8", marginLeft: 8 }}>{s.provider}</span>
							</div>
							<button
								type="button"
								style={{
									background: "transparent",
									border: "none",
									color: "#ef4444",
									cursor: "pointer",
									fontSize: 12,
								}}
								onClick={() => handleStop(s.id)}
							>
								Stop
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default PythiaPage;

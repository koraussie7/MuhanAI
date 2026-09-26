import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	answerWithBitterbot,
	type BitterbotMessage,
	type BitterbotResponse,
	clearBitterbotHistory,
	loadBitterbotHistory,
	saveBitterbotHistory,
} from "../../lib/bitterbot-engine.js";

function message(role: BitterbotMessage["role"], content: string): BitterbotMessage {
	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		role,
		content,
		createdAt: Date.now(),
	};
}

export function BitterbotChat() {
	const [messages, setMessages] = useState<BitterbotMessage[]>(loadBitterbotHistory);
	const [input, setInput] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [lastResponse, setLastResponse] = useState<BitterbotResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
		});
	}, [messages, isGenerating]);

	useEffect(() => {
		saveBitterbotHistory(messages);
	}, [messages]);

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		const query = input.trim();
		if (!query || isGenerating) return;
		const userMessage = message("user", query);
		const nextMessages = [...messages, userMessage];
		setMessages(nextMessages);
		setInput("");
		setError(null);
		setIsGenerating(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const response = await answerWithBitterbot(nextMessages, {
				signal: controller.signal,
			});
			if (!response) throw new Error("Bitterbot did not return a response");
			setLastResponse(response);
			setMessages((current) => [...current, message("assistant", response.text)]);
		} catch (cause) {
			if ((cause as Error)?.name !== "AbortError")
				setError(cause instanceof Error ? cause.message : "Bitterbot request failed");
		} finally {
			abortRef.current = null;
			setIsGenerating(false);
		}
	};

	const clearChat = () => {
		abortRef.current?.abort();
		clearBitterbotHistory();
		setMessages([]);
		setLastResponse(null);
		setError(null);
		setIsGenerating(false);
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100%",
				color: "#e2e8f0",
				fontSize: "11px",
			}}
		>
			<div
				style={{
					padding: "0.5rem 0.75rem",
					background: "rgba(245, 158, 11, 0.1)",
					borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div>
					<strong>Bitterbot Agent</strong>
					<span style={{ marginLeft: 8, color: "#10b981" }}>LOCAL / OFFLINE READY</span>
				</div>
				<button
					type="button"
					onClick={clearChat}
					style={{
						background: "transparent",
						border: "1px solid rgba(255,255,255,.15)",
						borderRadius: 4,
						color: "#cbd5e1",
						padding: "3px 7px",
						cursor: "pointer",
					}}
				>
					Clear
				</button>
			</div>
			<div
				style={{
					flex: 1,
					padding: "0.75rem",
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 8,
				}}
			>
				{messages.length === 0 && (
					<div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
						Ask Bitterbot anything. It tries local WebGPU, local OpenAI-compatible runtimes, and
						always returns an offline status response when inference is unavailable.
					</div>
				)}
				{messages.map((item) => (
					<div
						key={item.id}
						style={{
							alignSelf: item.role === "user" ? "flex-end" : "flex-start",
							maxWidth: "88%",
							padding: "7px 9px",
							borderRadius: 7,
							background: item.role === "user" ? "rgba(56,189,248,.16)" : "rgba(255,255,255,.06)",
							whiteSpace: "pre-wrap",
							lineHeight: 1.5,
						}}
					>
						<strong style={{ color: item.role === "user" ? "#38bdf8" : "#f59e0b" }}>
							{item.role === "user" ? "You" : "Bitterbot"}
						</strong>
						<div>{item.content}</div>
					</div>
				))}
				{isGenerating && <div style={{ color: "#f59e0b" }}>Bitterbot is thinking…</div>}
				{error && (
					<div role="alert" style={{ color: "#fb7185" }}>
						{error}
					</div>
				)}
				<div ref={messagesEndRef} aria-hidden="true" />
			</div>
			{lastResponse && (
				<div style={{ padding: "0 0.75rem 0.4rem", color: "#64748b" }}>
					Provider: {lastResponse.provider} · {lastResponse.model}
				</div>
			)}
			<form
				onSubmit={submit}
				style={{
					display: "flex",
					gap: 6,
					padding: "0.6rem",
					borderTop: "1px solid rgba(255,255,255,.1)",
				}}
			>
				<input
					value={input}
					onChange={(event) => setInput(event.target.value)}
					placeholder="Talk to Bitterbot…"
					aria-label="Message Bitterbot"
					disabled={isGenerating}
					style={{
						flex: 1,
						minWidth: 0,
						padding: "7px 8px",
						borderRadius: 5,
						border: "1px solid rgba(255,255,255,.15)",
						background: "rgba(0,0,0,.25)",
						color: "#e2e8f0",
						outline: "none",
					}}
				/>
				{isGenerating ? (
					<button
						type="button"
						onClick={() => abortRef.current?.abort()}
						style={{
							padding: "0 10px",
							borderRadius: 5,
							border: 0,
							background: "#f59e0b",
							cursor: "pointer",
						}}
					>
						Stop
					</button>
				) : (
					<button
						type="submit"
						style={{
							padding: "0 10px",
							borderRadius: 5,
							border: 0,
							background: "#38bdf8",
							color: "#07111f",
							cursor: "pointer",
						}}
					>
						Send
					</button>
				)}
			</form>
		</div>
	);
}

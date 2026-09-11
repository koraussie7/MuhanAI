import { useState } from "react";
import { useAIEngine } from "./hooks/useAIEngine";

export function ChatWidget() {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);

	const {
		status,
		models,
		isGenerating,
		output,
		loadModel,
		stream,
	} = useAIEngine({
		type: "sipp",
		backend: "webgpu",
		model: "llama-3-8b-q4",
	});

	const handleSend = async () => {
		if (!input.trim() || isGenerating) return;

		const userMessage = { role: "user", content: input };
		setMessages((prev) => [...prev, userMessage]);
		setInput("");

		try {
			await stream(input);
			setMessages((prev) => [...prev, { role: "assistant", content: output }]);
		} catch (error) {
			console.error("Stream error:", error);
		}
	};

	return (
		<div className="ai-chat-widget">
			<div className="chat-header">
				<h3>MuhanAI Chat</h3>
				<div className="status">
					{status.ready ? "✅ Ready" : status.loading ? "⏳ Loading..." : "❌ Not Ready"}
				</div>
			</div>

			<div className="model-selector">
				<select
					value={status.modelLoaded || ""}
					onChange={(e) => loadModel(e.target.value)}
					disabled={status.loading}
				>
					<option value="">Select Model</option>
					{models.map((m) => (
						<option key={m.id} value={m.id}>
							{m.name} {m.downloaded ? "(Downloaded)" : "(Download Required)"}
						</option>
					))}
				</select>
			</div>

			<div className="messages">
				{messages.map((msg, i) => (
					<div key={i} className={`message ${msg.role}`}>
						{msg.content}
					</div>
				))}
				{isGenerating && output && (
					<div className="message assistant streaming">
						{output}
						<span className="cursor">▋</span>
					</div>
				)}
			</div>

			<div className="input-area">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyPress={(e) => e.key === "Enter" && handleSend()}
					disabled={!status.ready || isGenerating}
					placeholder={status.ready ? "메시지 입력..." : "엔진 초기화 중..."}
				/>
				<button
					onClick={handleSend}
					disabled={!status.ready || isGenerating || !input.trim()}
				>
					{isGenerating ? "생성 중..." : "전송"}
				</button>
			</div>
		</div>
	);
}

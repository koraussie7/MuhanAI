import type React from "react";
import { useState } from "react";
import { ModelSearch, type ModelManifest } from "./noema/ModelSearch.js";

interface AskNetworkProps {
	onSubmit?: (question: string, targets: string[], model?: ModelManifest) => void;
}

const TARGETS = [
	{ id: "ai", label: "AI", icon: "🤖", description: "LLM Models" },
	{
		id: "omniroute",
		label: "OmniRoute",
		icon: "🔀",
		description: "OmniRoute Mesh (356 Providers)",
	},
	{
		id: "agent-cast",
		label: "Agent Cast",
		icon: "📻",
		description: "Multi-Agent Consensus",
	},
	{
		id: "mcp-quorum",
		label: "MCP Quorum",
		icon: "⚖️",
		description: "MCP Consensus",
	},
	{
		id: "browser-use",
		label: "Browse Use",
		icon: "🌐",
		description: "Browser Automation — Noema 모델 검색/다운로드와 연동",
		codeLink: "https://github.com/koraussie7/MuhanAI/tree/main/packaging/npm/token-free-gateway/agentmesh/packages/browser-use",
	},
];

export const AskNetwork: React.FC<AskNetworkProps> = ({ onSubmit }) => {
	const [question, setQuestion] = useState("");
	const [selectedTargets, setSelectedTargets] = useState<string[]>([
		"ai",
		"omniroute",
		"agent-cast",
		"mcp-quorum",
		"browser-use",
	]);
	const [selectedModel, setSelectedModel] = useState<ModelManifest | undefined>();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isModelSearchOpen, setIsModelSearchOpen] = useState(false);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (question.trim() && onSubmit) {
			onSubmit(question.trim(), selectedTargets, selectedModel);
			setQuestion("");
		}
	};

	const toggleTarget = (targetId: string) => {
		setSelectedTargets((prev) =>
			prev.includes(targetId) ? prev.filter((t) => t !== targetId) : [...prev, targetId],
		);
	};

	const openModelSearch = () => {
		setIsModelSearchOpen(true);
		setIsExpanded(true);
	};

	const closeModelSearch = () => {
		setIsModelSearchOpen(false);
	};

	const handleModelSelect = (manifest: ModelManifest) => {
		setSelectedModel(manifest);
		setIsModelSearchOpen(false);
		setSelectedTargets((prev) =>
			prev.includes("browser-use") ? prev : [...prev, "browser-use"],
		);
	};

	return (
		<div className={`ask-network ${isExpanded ? "expanded" : ""}`}>
			<form onSubmit={handleSubmit} className="ask-form">
				<div className="ask-input-wrapper">
					<label htmlFor="network-question" className="ask-label">
						<span className="label-icon">🌐</span>
						<span className="label-text">ASK NETWORK</span>
					</label>
					<div className="input-group">
						<textarea
							id="network-question"
							className="ask-textarea"
							placeholder="무엇이든 네트워크에 물어보세요..."
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							onFocus={() => setIsExpanded(true)}
							onBlur={() => setTimeout(() => setIsExpanded(false), 200)}
							rows={isExpanded ? 3 : 1}
						/>
						<button
							type="submit"
							className="btn-primary ask-submit-btn"
							disabled={!question.trim()}
						>
							보내기
						</button>
					</div>
				</div>

				<div className="ask-targets">
					<span className="targets-label">Route to:</span>
					<div className="target-chips">
						{TARGETS.map((target) => (
							<button
								key={target.id}
								type="button"
								className={`target-chip ${selectedTargets.includes(target.id) ? "selected" : ""} ${
									target.id === "browser-use" ? "with-model" : ""
								}`}
								onClick={target.id === "browser-use" ? openModelSearch : () => toggleTarget(target.id)}
								title={target.description}
							>
								<span className="chip-icon">{target.icon}</span>
								<span className="chip-label">{target.label}</span>
								{target.id === "browser-use" && selectedModel && (
									<span className="chip-model-badge" title={`선택 모델: ${selectedModel.name}`}>
										{selectedModel.name.split("/").pop() ?? selectedModel.name}
									</span>
								)}
							</button>
						))}
					</div>
				</div>

				{isExpanded && question.trim() && (
					<div className="ask-preview">
						<span className="preview-label">Will cast to:</span>
						<div className="preview-targets">
							{selectedTargets.map((id) => {
								const target = TARGETS.find((t) => t.id === id);
								return target ? (
									<span key={id} className="preview-chip">
										{target.icon} {target.label}
									</span>
								) : null;
							})}
							{selectedModel && (
								<span className="preview-model-chip">
									🤖 {selectedModel.name}
								</span>
							)}
						</div>
					</div>
				)}

				{isModelSearchOpen && (
					<div className="model-search-overlay" onClick={closeModelSearch}>
						<div className="model-search-modal" onClick={(e) => e.stopPropagation()}>
							<div className="modal-header">
								<h3>Noema 모델 검색</h3>
								<button type="button" className="modal-close" onClick={closeModelSearch}>
									✕
								</button>
							</div>
							<ModelSearch onSelect={handleModelSelect} />
						</div>
					</div>
				)}
			</form>
		</div>
	);
};

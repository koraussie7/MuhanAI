import type React from "react";
import { useState } from "react";
import { HUMAN_KNOWLEDGE_WANTED } from "../data/mockData";

interface HumanKnowledgeItem {
	id: string;
	question: string;
	category: string;
	aiConfidence: number;
	humanAnswers: number;
	reward: number;
	tags: string[];
}

interface HumanKnowledgeWantedProps {
	items?: HumanKnowledgeItem[];
	maxItems?: number;
}

export const HumanKnowledgeWanted: React.FC<HumanKnowledgeWantedProps> = ({
	items = HUMAN_KNOWLEDGE_WANTED,
	maxItems = 3,
}) => {
	const [activeTab, setActiveTab] = useState<"all" | "experience" | "expert" | "local">("all");

	const filteredItems =
		activeTab === "all"
			? items.slice(0, maxItems)
			: items.filter((item) => item.tags.includes(activeTab)).slice(0, maxItems);

	const tabs = [
		{ id: "all", label: "전체", icon: "👤" },
		{ id: "experience", label: "경험", icon: "💡" },
		{ id: "expert", label: "전문", icon: "🎓" },
		{ id: "local", label: "현지", icon: "📍" },
	];

	return (
		<section className="human-knowledge-section">
			<div className="section-header">
				<h2 className="section-title">
					<span className="human-icon">👤</span>
					HUMAN KNOWLEDGE WANTED
				</h2>
				<p className="section-subtitle">당신만 알고 있을 수 있는 경험</p>
			</div>

			<div className="knowledge-tabs">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
						onClick={() => setActiveTab(tab.id as typeof activeTab)}
					>
						<span className="tab-icon">{tab.icon}</span>
						<span className="tab-label">{tab.label}</span>
					</button>
				))}
			</div>

			<div className="knowledge-items">
				{filteredItems.map((item: HumanKnowledgeItem) => (
					<div key={item.id} className="knowledge-item">
						<div className="knowledge-question">"{item.question}"</div>
						<div className="knowledge-meta">
							<span className="knowledge-category">{item.category}</span>
							<div className="knowledge-stats">
								<span className="stat">
									<span className="stat-icon">🤖</span>
									AI {item.aiConfidence}%
								</span>
								<span className="stat">
									<span className="stat-icon">👥</span>
									{item.humanAnswers} 답변
								</span>
								<span className="stat reward">
									<span className="stat-icon">💰</span>+{item.reward}
								</span>
							</div>
						</div>
						<button type="button" className="btn-primary share-experience-btn">
							경험 공유하기
						</button>
					</div>
				))}
			</div>

			<button type="button" className="btn-secondary view-more-btn">
				더 많은 지식 요청 보기 →
			</button>
		</section>
	);
};

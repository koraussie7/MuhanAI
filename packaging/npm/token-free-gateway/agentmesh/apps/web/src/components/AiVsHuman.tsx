import type React from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { PageBox } from "./PageBox.js";

interface VersusItem {
	id: string;
	question: string;
	aiConsensus: number;
	humanConsensus: number;
	winner: "AI" | "HUMAN" | "undecided";
	participants: { ai: number; human: number };
	tags: string[];
}

interface AiVsHumanProps {
	maxItems?: number;
}

export const AiVsHuman: React.FC<AiVsHumanProps> = ({ maxItems = 3 }) => {
	const { t } = useI18n();
	const [items, setItems] = useState<VersusItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchItems = async () => {
			try {
				const res = await fetch("/api/ai-vs-human");
				if (res.ok) {
					const data = await res.json();
					setItems(data);
				}
			} catch {
				// Silently fail
			} finally {
				setLoading(false);
			}
		};
		fetchItems();
	}, []);

	const LoadingView = () => (
		<section className="ai-vs-human-section" aria-label="AI vs Human">
			<h3 className="section-title">AI vs HUMAN CONSENSUS</h3>
			<div className="ai-vs-human-list">
				{[...Array(maxItems)].map((_, i) => (
					<div key={i} className="vs-item skeleton">
						<div className="skeleton-question" />
						<div className="skeleton-bars" />
					</div>
				))}
			</div>
		</section>
	);

	const EmptyView = () => (
		<section className="ai-vs-human-section" aria-label="AI vs Human">
			<h3 className="section-title">AI vs HUMAN CONSENSUS</h3>
			<p className="empty-state">No consensus votes yet</p>
		</section>
	);

	const ContentView = () => (
		<section className="ai-vs-human-section" aria-label="AI vs Human">
			<h3 className="section-title">AI vs HUMAN CONSENSUS</h3>
			<div className="ai-vs-human-list">
				{items.slice(0, maxItems).map((item) => (
					<div key={item.id} className="vs-item">
						<div className="vs-question">{item.question}</div>
						<div className="vs-bars">
							<div className="vs-bar-row">
								<span className="vs-label">🤖 AI</span>
								<div className="vs-bar-container">
									<div className="vs-bar ai" style={{ width: `${item.aiConsensus}%` }}></div>
								</div>
								<span className="vs-percent">{item.aiConsensus}%</span>
							</div>
							<div className="vs-bar-row">
								<span className="vs-label">👤 Human</span>
								<div className="vs-bar-container">
									<div className="vs-bar human" style={{ width: `${item.humanConsensus}%` }}></div>
								</div>
								<span className="vs-percent">{item.humanConsensus}%</span>
							</div>
						</div>
						<div className="vs-winner">
							<span className={`winner-badge ${item.winner.toLowerCase()}`}>
								{item.winner === "AI"
									? "🤖 AI Wins"
									: item.winner === "HUMAN"
										? "👤 Human Wins"
										: "⏳ Undecided"}
							</span>
							<span className="participants">
								🤖 {item.participants.ai} · 👤 {item.participants.human}
							</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);

	if (loading)
		return (
			<PageBox iconKey="users" title="AI vs Human" subtitle="AI와 인간의 합의 비교">
				<LoadingView />
			</PageBox>
		);
	if (items.length === 0)
		return (
			<PageBox iconKey="users" title="AI vs Human" subtitle="AI와 인간의 합의 비교">
				<EmptyView />
			</PageBox>
		);
	return (
		<PageBox iconKey="users" title="AI vs Human" subtitle="AI와 인간의 합의 비교">
			<ContentView />
		</PageBox>
	);
};

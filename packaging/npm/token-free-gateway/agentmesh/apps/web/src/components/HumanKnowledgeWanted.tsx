import type React from "react";
import { PageBox } from "./PageBox.js";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

interface HumanWanted {
	id: string;
	question: string;
	category: string;
	aiConfidence: number;
	humanAnswers: number;
	reward: number;
	tags: string[];
}

interface HumanKnowledgeWantedProps {
	maxItems?: number;
}

export const HumanKnowledgeWanted: React.FC<HumanKnowledgeWantedProps> = ({
	maxItems = 3,
}) => {
	const { t } = useI18n();
	const [items, setItems] = useState<HumanWanted[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchItems = async () => {
			try {
				const res = await fetch("/api/human-wanted");
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
		<section className="human-wanted-section" aria-label="Human Knowledge Wanted">
			<h3 className="section-title">HUMAN KNOWLEDGE WANTED</h3>
			<div className="human-wanted-list">
				{[...Array(maxItems)].map((_, i) => (
					<div key={i} className="human-wanted-item skeleton">
						<div className="skeleton-question" />
						<div className="skeleton-meta" />
					</div>
				))}
			</div>
		</section>
	);

	const EmptyView = () => (
		<section className="human-wanted-section" aria-label="Human Knowledge Wanted">
			<h3 className="section-title">HUMAN KNOWLEDGE WANTED</h3>
			<p className="empty-state">No questions needing human knowledge yet</p>
		</section>
	);

	const ContentView = () => (
		<section className="human-wanted-section" aria-label="Human Knowledge Wanted">
			<h3 className="section-title">HUMAN KNOWLEDGE WANTED</h3>
			<div className="human-wanted-list">
				{items.slice(0, maxItems).map((item) => (
					<div key={item.id} className="human-wanted-item">
						<div className="question-text">{item.question}</div>
						<div className="item-meta">
							<span className="category-tag">{item.category}</span>
							<span className="reward">💰 {item.reward} credits</span>
							<span className="confidence">AI: {item.aiConfidence}%</span>
							<span className="answers">👤 {item.humanAnswers} answers</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);

	if (loading)
		return (
			<PageBox iconKey="user" title="인간 지식 요청" subtitle="사람의 지식이 필요한 질문들">
				<LoadingView />
			</PageBox>
		);
	if (items.length === 0)
		return (
			<PageBox iconKey="user" title="인간 지식 요청" subtitle="사람의 지식이 필요한 질문들">
				<EmptyView />
			</PageBox>
		);
	return (
		<PageBox iconKey="user" title="인간 지식 요청" subtitle="사람의 지식이 필요한 질문들">
			<ContentView />
		</PageBox>
	);
};
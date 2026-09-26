import type React from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { PageBox } from "./PageBox.js";

interface TrendingQuestion {
	id: string;
	topic: string;
	participants: number;
	score: number;
	trend?: "up" | "down" | "stable";
	category: string;
}

interface TrendingQuestionsProps {
	maxItems?: number;
}

function LoadingView({ maxItems }: { maxItems: number }) {
	return (
		<section className="trending-questions-section" aria-label="Trending Questions">
			<div className="section-header">
				<h2 className="section-title">
					<span className="fire-icon">🔥</span>
					TRENDING QUESTIONS
				</h2>
			</div>
			<div className="trending-list">
				{[...Array(maxItems)].map((_, i) => (
					<div key={i} className="trending-item skeleton">
						<div className="skeleton-rank" />
						<div className="skeleton-topic" />
						<div className="skeleton-bar" />
					</div>
				))}
			</div>
		</section>
	);
}

function EmptyView({ t }: { t: any }) {
	return (
		<section className="trending-questions-section" aria-label="Trending Questions">
			<div className="section-header">
				<h2 className="section-title">
					<span className="fire-icon">🔥</span>
					TRENDING QUESTIONS
				</h2>
			</div>
			<p className="empty-state">No trending questions yet</p>
		</section>
	);
}

function ContentView({ questions, t }: { questions: TrendingQuestion[]; t: any }) {
	const sortedQuestions = [...questions].sort((a, b) => b.score - a.score).slice(0, 5);
	const maxParticipants = Math.max(1, ...sortedQuestions.map((q) => q.participants), 1);

	const getBarWidth = (participants: number, max: number) => {
		return Math.min((participants / Math.max(1, max)) * 100, 100);
	};

	return (
		<section className="trending-questions-section" aria-label="Trending Questions">
			<div className="section-header">
				<h2 className="section-title">
					<span className="fire-icon">🔥</span>
					TRENDING QUESTIONS
				</h2>
			</div>

			<div className="trending-list">
				{sortedQuestions.map((question, index) => (
					<div key={question.id} className="trending-item">
						<div className="trending-rank">#{index + 1}</div>
						<div className="trending-info">
							<div className="trending-topic">{question.topic}</div>
							<div className="trending-bar-container">
								<div
									className="trending-bar"
									style={{
										width: `${Math.min((question.participants / Math.max(1, maxParticipants)) * 100, 100)}%`,
									}}
								></div>
							</div>
						</div>
						<div className="trending-stats">
							<span className="participant-count">{question.participants.toLocaleString()}</span>
							<span className={"trend-indicator " + (question.trend ?? "stable")}>
								{question.trend === "up" ? "↑" : question.trend === "down" ? "↓" : "→"}
							</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

interface TrendingQuestion {
	id: string;
	topic: string;
	participants: number;
	score: number;
	trend?: "up" | "down" | "stable";
	category: string;
}

interface TrendingQuestionsProps {
	maxItems?: number;
}

function TrendingQuestionsComponent({ maxItems = 5 }: TrendingQuestionsProps) {
	const { t } = useI18n();
	const [questions, setQuestions] = useState<TrendingQuestion[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchQuestions = async () => {
			try {
				const res = await fetch("/api/trending");
				if (res.ok) {
					const data = await res.json();
					setQuestions(data);
				}
			} catch {
				// Silently fail - component will show empty state
			} finally {
				setLoading(false);
			}
		};
		fetchQuestions();
	}, []);

	if (loading)
		return (
			<PageBox iconKey="trending-up" title="인기 질문" subtitle="현재 트렌딩 중인 질문들">
				<LoadingView maxItems={maxItems} />
			</PageBox>
		);
	if (questions.length === 0)
		return (
			<PageBox iconKey="trending-up" title="인기 질문" subtitle="현재 트렌딩 중인 질문들">
				<EmptyView t={t} />
			</PageBox>
		);
	return (
		<PageBox iconKey="trending-up" title="인기 질문" subtitle="현재 트렌딩 중인 질문들">
			<ContentView questions={questions} t={t} />
		</PageBox>
	);
}

export const TrendingQuestions = TrendingQuestionsComponent;

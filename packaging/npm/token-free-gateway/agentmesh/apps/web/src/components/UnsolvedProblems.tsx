import type React from "react";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { PageBox } from "./PageBox.js";

interface UnsolvedProblem {
	id: string;
	title: string;
	description: string;
	category: string;
	aiAgents: number;
	humanExperts: number;
	sources: number;
	consensus: number;
	tags: string[];
}

interface UnsolvedProblemsProps {
	maxItems?: number;
}

export const UnsolvedProblems: React.FC<UnsolvedProblemsProps> = ({ maxItems = 4 }) => {
	const { t } = useI18n();
	const [problems, setProblems] = useState<UnsolvedProblem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchProblems = async () => {
			try {
				const res = await fetch("/api/unsolved");
				if (res.ok) {
					const data = await res.json();
					setProblems(data);
				}
			} catch {
				// Silently fail
			} finally {
				setLoading(false);
			}
		};
		fetchProblems();
	}, []);

	const LoadingView = () => (
		<section className="unsolved-problems-section" aria-label="Unsolved Problems">
			<div className="section-header">
				<h2 className="section-title">UNSOLVED PROBLEMS</h2>
			</div>
			<div className="unsolved-list">
				{[...Array(maxItems)].map((_, i) => (
					<div key={i} className="unsolved-item skeleton">
						<div className="skeleton-title" />
						<div className="skeleton-desc" />
					</div>
				))}
			</div>
		</section>
	);

	const EmptyView = () => (
		<section className="unsolved-problems-section" aria-label="Unsolved Problems">
			<div className="section-header">
				<h2 className="section-title">UNSOLVED PROBLEMS</h2>
			</div>
			<p className="empty-state">No unsolved problems yet</p>
		</section>
	);

	const ContentView = () => (
		<section className="unsolved-problems-section" aria-label="Unsolved Problems">
			<div className="section-header">
				<h2 className="section-title">UNSOLVED PROBLEMS</h2>
			</div>
			<div className="unsolved-list">
				{problems.slice(0, maxItems).map((problem) => (
					<div key={problem.id} className="unsolved-item">
						<h3 className="unsolved-title">{problem.title}</h3>
						<p className="unsolved-desc">{problem.description}</p>
						<div className="unsolved-meta">
							<span className="meta-item">🤖 {problem.aiAgents} AI</span>
							<span className="meta-item">👤 {problem.humanExperts} Experts</span>
							<span className="meta-item">📊 {problem.consensus}% Consensus</span>
						</div>
					</div>
				))}
			</div>
		</section>
	);

	if (loading)
		return (
			<PageBox iconKey="alert-triangle" title="미해결 문제" subtitle="해결이 필요한 문제 목록">
				<LoadingView />
			</PageBox>
		);
	if (problems.length === 0)
		return (
			<PageBox iconKey="alert-triangle" title="미해결 문제" subtitle="해결이 필요한 문제 목록">
				<EmptyView />
			</PageBox>
		);
	return (
		<PageBox iconKey="alert-triangle" title="미해결 문제" subtitle="해결이 필요한 문제 목록">
			<ContentView />
		</PageBox>
	);
};

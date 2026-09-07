import { useState } from "react";

export function SemanticVote({ onSubmit }: { onSubmit: (route: string, primary: string) => void }) {
	const [text, setText] = useState("");
	const [result, setResult] = useState<{
		primary: string;
		route: string;
		topicId?: string;
	} | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!text.trim()) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/semantic/classify", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "classify failed");
			setResult(data);
			onSubmit(data.route, data.primary);
		} catch (e) {
			setError(e instanceof Error ? e.message : "classify failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="panel">
			<h3>Semantic Vote</h3>
			<div className="search-bar">
				<input
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="질문을 입력하세요... 자동 라우팅"
					onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
				/>
				<button onClick={submit} disabled={loading}>
					{loading ? "분류 중..." : "Classify"}
				</button>
			</div>
			{error && <p className="form-error">{error}</p>}
			{result && (
				<div className="cast-results">
					<div>
						Primary: <strong>{result.primary}</strong> · Route: <strong>{result.route}</strong>
					</div>
					{result.topicId && <div className="cast-time">Topic: {result.topicId}</div>}
				</div>
			)}
		</section>
	);
}

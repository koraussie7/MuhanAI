import type React from "react";
import { useState } from "react";

// AgentFM-inspired: Task Dispatch Board (Kanban / Queue / Live Dispatch)
export type TaskItem = {
	id: string;
	title: string;
	description: string;
	assignedAgent: string;
	agentType: "llm" | "human" | "p2p" | "hybrid";
	priority: "high" | "medium" | "low";
	status: "queued" | "dispatching" | "running" | "completed";
	progress: number;
	credits: number;
	timestamp: string;
};

const INITIAL_TASKS: TaskItem[] = [
	{
		id: "TASK-8901",
		title: "WebRTC DataChannel MTU 최적화 벤치마크",
		description: "브라우저 간 64KB 초과 페이로드 분할 전송 성능 측정",
		assignedAgent: "Claude 3.5 Sonnet",
		agentType: "llm",
		priority: "high",
		status: "running",
		progress: 74,
		credits: 120,
		timestamp: "방금 전",
	},
	{
		id: "TASK-8902",
		title: "ISEK DID Registry 온체인 증명 검증",
		description: "새로 등록된 14개 노드의 암호학적 서명 유효성 검사",
		assignedAgent: "Dr. Yeon (Human Validator)",
		agentType: "human",
		priority: "high",
		status: "dispatching",
		progress: 30,
		credits: 250,
		timestamp: "2분 전",
	},
	{
		id: "TASK-8903",
		title: "InfoMesh P2P 분산 지식 인덱스 동기화",
		description: "CRDT v2 기반 시맨틱 트리플 4.2만 개 병합",
		assignedAgent: "Gemini 1.5 Pro",
		agentType: "p2p",
		priority: "medium",
		status: "queued",
		progress: 0,
		credits: 80,
		timestamp: "5분 전",
	},
	{
		id: "TASK-8904",
		title: "Llama-3.3 Local GGUF 샤딩 추론 테스트",
		description: "Edge 노드 3대 메모리 캐시 분할 레이턴시 측정",
		assignedAgent: "Local Node Alpha",
		agentType: "hybrid",
		priority: "low",
		status: "completed",
		progress: 100,
		credits: 150,
		timestamp: "12분 전",
	},
];

export function TaskDispatchBoard() {
	const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
	const [activeTab, setActiveTab] = useState<string>("all");
	const [newTaskTitle, setNewTaskTitle] = useState("");

	const handleCreateTask = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newTaskTitle.trim()) return;
		const item: TaskItem = {
			id: `TASK-${Math.floor(1000 + Math.random() * 9000)}`,
			title: newTaskTitle.trim(),
			description: "사용자 직접 생성 태스크 — AgentFM 라우터가 최적 에이전트 자동 배정",
			assignedAgent: "Auto-Routing...",
			agentType: "hybrid",
			priority: "medium",
			status: "queued",
			progress: 0,
			credits: 100,
			timestamp: "방금 전",
		};
		setTasks([item, ...tasks]);
		setNewTaskTitle("");
	};

	const advanceStatus = (taskId: string) => {
		setTasks((prev) =>
			prev.map((t) => {
				if (t.id !== taskId) return t;
				if (t.status === "queued") return { ...t, status: "dispatching", progress: 25 };
				if (t.status === "dispatching") return { ...t, status: "running", progress: 65 };
				if (t.status === "running") return { ...t, status: "completed", progress: 100 };
				return t;
			}),
		);
	};

	const filtered = activeTab === "all" ? tasks : tasks.filter((t) => t.status === activeTab);

	return (
		<div className="task-dispatch-container">
			{/* Quick Add Bar */}
			<form onSubmit={handleCreateTask} className="task-dispatch-bar">
				<input
					type="text"
					className="search-input"
					placeholder="새 분산 에이전트 작업 등록 (예: WebRTC 핸드셰이크 테스트)..."
					value={newTaskTitle}
					onChange={(e) => setNewTaskTitle(e.target.value)}
					style={{ flex: 1, padding: "10px 14px" }}
				/>
				<button type="submit" className="primary-button">
					+ 작업 디스패치
				</button>
			</form>

			{/* Filter Tabs */}
			<div className="policy-row" style={{ marginTop: 14, marginBottom: 14 }}>
				{[
					{ key: "all", label: `전체 (${tasks.length})` },
					{
						key: "queued",
						label: `대기 (${tasks.filter((t) => t.status === "queued").length})`,
					},
					{
						key: "dispatching",
						label: `배정 중 (${tasks.filter((t) => t.status === "dispatching").length})`,
					},
					{
						key: "running",
						label: `실행 중 (${tasks.filter((t) => t.status === "running").length})`,
					},
					{
						key: "completed",
						label: `완료 (${tasks.filter((t) => t.status === "completed").length})`,
					},
				].map((tab) => (
					<button
						key={tab.key}
						className={`policy-chip ${activeTab === tab.key ? "active" : ""}`}
						onClick={() => setActiveTab(tab.key)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Task Grid */}
			<div className="peer-grid">
				{filtered.map((task) => (
					<article
						className="peer-card"
						key={task.id}
						style={{ display: "flex", flexDirection: "column", gap: 8 }}
					>
						<div className="peer-card-head">
							<span
								className={`webrtc-dot ${
									task.status === "completed"
										? "connected"
										: task.status === "running"
											? "connecting"
											: "offline"
								}`}
							/>
							<strong className="peer-name" style={{ fontSize: 13 }}>
								{task.id}
							</strong>
							<span
								className={`protocol-badge ${
									task.priority === "high"
										? "proto-libp2p"
										: task.priority === "medium"
											? "proto-websocket"
											: "proto-memory"
								}`}
							>
								{task.priority.toUpperCase()}
							</span>
						</div>

						<h4 style={{ margin: "4px 0 2px", fontSize: 14, color: "#f4f5ed" }}>{task.title}</h4>
						<p
							style={{
								fontSize: 12,
								color: "#8f9188",
								margin: 0,
								lineHeight: 1.4,
							}}
						>
							{task.description}
						</p>

						<div className="peer-card-meta" style={{ marginTop: 6 }}>
							<span>
								담당: <strong style={{ color: "#d1d4c7" }}>{task.assignedAgent}</strong>
							</span>
							<span className="peer-latency">+{task.credits} CR</span>
						</div>

						{/* Progress Bar */}
						<div
							style={{
								background: "#22251d",
								borderRadius: 3,
								height: 6,
								overflow: "hidden",
								marginTop: 4,
							}}
						>
							<div
								style={{
									width: `${task.progress}%`,
									height: "100%",
									background: task.progress === 100 ? "#e6ff87" : "#ffb86b",
									transition: "width 0.3s ease",
								}}
							/>
						</div>

						<div className="peer-card-foot" style={{ marginTop: 8 }}>
							<span style={{ fontSize: 11, color: "#777a6e" }}>{task.timestamp}</span>
							{task.status !== "completed" ? (
								<button
									type="button"
									className="btn-secondary sm"
									onClick={() => advanceStatus(task.id)}
								>
									{task.status === "queued"
										? "배정 실행 ▶"
										: task.status === "dispatching"
											? "실행 시작 ▶"
											: "완료 처리 ✓"}
								</button>
							) : (
								<span style={{ color: "#e6ff87", fontSize: 12, fontWeight: 700 }}>✓ 정산 완료</span>
							)}
						</div>
					</article>
				))}
			</div>
		</div>
	);
}

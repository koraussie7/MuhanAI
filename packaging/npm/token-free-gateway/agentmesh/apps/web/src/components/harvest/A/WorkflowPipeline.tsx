import React, { useState } from "react";

// AgentFM-inspired: Autonomous Multi-Agent Pipeline Visualizer
// NOTE: Despite the original "DAG" name, the working set is a strictly
// linear pipeline (each stage gates the next). We renamed to `Pipeline`
// so the file matches reality; a true branching/merging DAG would need
// an explicit edge list and a separate graph renderer.
export type PipelineStageStatus = "idle" | "running" | "success" | "error";

export interface PipelineStage {
	id: string;
	label: string;
	role: string;
	assignedTo: string;
	status: PipelineStageStatus;
	duration?: string;
}

const INITIAL_STAGES: PipelineStage[] = [
	{
		id: "intake",
		label: "쿼리 수신 & 복잡도 분석",
		role: "Router Node",
		assignedTo: "Local Gateway Router",
		status: "success",
		duration: "12ms",
	},
	{
		id: "search",
		label: "다중 에이전트 지식 검색",
		role: "Search Submesh",
		assignedTo: "Gemini + WebSearch",
		status: "success",
		duration: "1.1s",
	},
	{
		id: "consensus",
		label: "Agent Cast 4인 교차 합의",
		role: "Consensus Engine",
		assignedTo: "Claude + DeepSeek + Local",
		status: "running",
		duration: "처리 중...",
	},
	{
		id: "poh",
		label: "인간 전문가 검증 게이트",
		role: "PoH Validator",
		assignedTo: "Human Expert Pool",
		status: "idle",
	},
	{
		id: "store",
		label: "CRDT v2 지식 레이크 영구화",
		role: "Storage Mesh",
		assignedTo: "P2P Knowledge Pool",
		status: "idle",
	},
];

const RUNNING_DURATION = "처리 중...";
const DEFAULT_ADVANCE_DURATION = "1.4s";

export function WorkflowPipeline() {
	const [stages, setStages] = useState<PipelineStage[]>(INITIAL_STAGES);
	const [isRunning, setIsRunning] = useState(true);

	const advancePipeline = () => {
		setStages((prev) => {
			const runningIdx = prev.findIndex((n) => n.status === "running");
			if (runningIdx === -1) {
				setIsRunning(true);
				return prev.map((n, i) =>
					i === 0
						? { ...n, status: "running", duration: RUNNING_DURATION }
						: { ...n, status: "idle" },
				);
			}
			const isLast = runningIdx === prev.length - 1;
			setIsRunning(!isLast);
			return prev.map((n, i) => {
				if (i === runningIdx)
					return {
						...n,
						status: "success",
						duration: DEFAULT_ADVANCE_DURATION,
					};
				if (i === runningIdx + 1) return { ...n, status: "running", duration: RUNNING_DURATION };
				return n;
			});
		});
	};

	return (
		<div className="workflow-pipeline">
			<div className="peer-canvas-toolbar workflow-pipeline__toolbar">
				<div className="workflow-pipeline__heading">
					<span
						className="a2a-dot"
						style={{
							background: isRunning ? "var(--accent-lime, #e6ff87)" : "var(--text-muted, #888)",
						}}
					/>
					<strong>자율 실행 파이프라인 (Autonomous Pipeline #892)</strong>
					<span className="protocol-badge proto-webrtc">Live Pipeline</span>
				</div>
				<button type="button" className="btn-primary" onClick={advancePipeline}>
					다음 단계 강제 진행 ▶
				</button>
			</div>

			<div className="mesh-topology workflow-pipeline__flow">
				<div className="workflow-pipeline__column">
					{stages.map((stage, idx) => (
						<React.Fragment key={stage.id}>
							<PipelineStageCard stage={stage} />
							{idx < stages.length - 1 && (
								<div className="workflow-pipeline__connector" aria-hidden="true">
									↓
								</div>
							)}
						</React.Fragment>
					))}
				</div>
			</div>
		</div>
	);
}

function PipelineStageCard({ stage }: { stage: PipelineStage }) {
	const statusClass =
		stage.status === "success"
			? "is-success"
			: stage.status === "running"
				? "is-running"
				: stage.status === "error"
					? "is-error"
					: "is-idle";

	return (
		<article className={`feature-card workflow-pipeline__card ${statusClass}`}>
			<div className="workflow-pipeline__card-body">
				<div className="workflow-pipeline__card-title">
					<span
						className={`webrtc-dot ${
							stage.status === "success"
								? "connected"
								: stage.status === "running"
									? "connecting"
									: "offline"
						}`}
					/>
					<strong>{stage.label}</strong>
					<span className="protocol-badge proto-memory">{stage.role}</span>
				</div>
				<p className="workflow-pipeline__assignment">
					할당: <strong>{stage.assignedTo}</strong>
				</p>
			</div>
			<div className="workflow-pipeline__card-meta">
				<span
					className={`mesh-status ${
						stage.status === "success" ? "online" : stage.status === "running" ? "busy" : "offline"
					}`}
				>
					{stage.status === "success"
						? "✓ 완료"
						: stage.status === "running"
							? "● 처리 중"
							: stage.status === "error"
								? "✗ 오류"
								: "○ 대기"}
				</span>
				{stage.duration && <div className="workflow-pipeline__duration">{stage.duration}</div>}
			</div>
		</article>
	);
}

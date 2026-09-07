/**
 * WorkerPool — adapted from Agent-FM/agentfm-core compute worker card +
 * task dispatch board patterns (Apache-2.0).
 */
export interface ComputeWorker {
	id: string;
	role: string;
	load: number;
	tasks: number;
	status: "idle" | "busy" | "offline";
}

export function ComputeWorkerCard({ worker }: { worker: ComputeWorker }) {
	const statusClass =
		worker.status === "busy" ? "busy" : worker.status === "offline" ? "offline" : "idle";
	return (
		<article className={`hc-worker-card ${statusClass}`}>
			<header>
				<span className={`hc-status-dot ${statusClass}`} />
				<strong>{worker.id}</strong>
				<span className="hc-worker-role">{worker.role}</span>
			</header>
			<div className="hc-worker-load">
				<div className="hc-load-bar">
					<div
						className="hc-load-bar-fill"
						style={{ width: `${Math.round(worker.load * 100)}%` }}
					/>
				</div>
				<span className="hc-load-value">{Math.round(worker.load * 100)}%</span>
			</div>
			<footer>
				<span>처리 태스크 {worker.tasks}</span>
				<span className="hc-worker-status">{worker.status}</span>
			</footer>
		</article>
	);
}

export function WorkerPool({ workers }: { workers: ComputeWorker[] }) {
	const busy = workers.filter((w) => w.status === "busy").length;
	return (
		<section className="hc-panel">
			<h3 className="hc-panel-title">Worker Pool</h3>
			<p className="hc-panel-meta">
				{workers.length}대 중 {busy}대 가동 중 · 태스크 합계{" "}
				{workers.reduce((sum, w) => sum + w.tasks, 0)}
			</p>
			<div className="hc-worker-grid">
				{workers.map((w) => (
					<ComputeWorkerCard key={w.id} worker={w} />
				))}
			</div>
		</section>
	);
}

/**
 * TaskDispatchBoard — dispatch queue board (AgentFM DispatchDrawer pattern).
 */
export interface DispatchTask {
	id: string;
	title: string;
	target: string;
	progress: number;
}

export function TaskDispatchBoard({ tasks }: { tasks: DispatchTask[] }) {
	return (
		<section className="hc-panel">
			<h3 className="hc-panel-title">Task Dispatch</h3>
			<ul className="hc-dispatch-list">
				{tasks.map((task) => (
					<li key={task.id} className="hc-dispatch-item">
						<div className="hc-dispatch-head">
							<strong>{task.title}</strong>
							<span className="hc-dispatch-target">→ {task.target}</span>
						</div>
						<div className="hc-load-bar">
							<div
								className="hc-load-bar-fill"
								style={{ width: `${Math.round(task.progress * 100)}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

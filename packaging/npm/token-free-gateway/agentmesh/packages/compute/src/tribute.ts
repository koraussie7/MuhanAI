export interface ComputeTicket {
	taskId: string;
	projectId?: string;
	networkShare: number;
	personalShare: number;
	priority: "low" | "normal" | "high";
	status: "queued" | "running" | "completed" | "failed";
}

const PRIORITY_ORDER: Record<"low" | "normal" | "high", number> = {
	high: 0,
	normal: 1,
	low: 2,
};

export class ComputeTribute {
	private queue: ComputeTicket[] = [];
	private projectWeights = new Map<string, number>();
	private processing = false;
	private lock = Promise.resolve();

	setProjectWeight(projectId: string, weight: number): void {
		this.projectWeights.set(projectId, Math.max(0, Math.min(1, weight)));
	}

	// Acquire lock to prevent race conditions on queue operations
	private async acquireLock<T>(fn: () => T): Promise<T> {
		const current = this.lock;
		let resolve!: () => void;
		this.lock = new Promise<void>((r) => {
			resolve = r;
		});
		await current;
		try {
			return fn();
		} finally {
			resolve();
		}
	}

	async submit(ticket: ComputeTicket): Promise<void> {
		await this.acquireLock(() => {
			this.queue.push(ticket);
			this.queue.sort((a, b) => {
				// First sort by priority (high -> normal -> low)
				const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
				if (priorityDiff !== 0) return priorityDiff;
				// Then by project weight (higher weight first)
				return (
					(this.projectWeights.get(b.projectId ?? "") ?? 0) -
					(this.projectWeights.get(a.projectId ?? "") ?? 0)
				);
			});
		});
	}

	async next(): Promise<ComputeTicket | undefined> {
		return this.acquireLock(() => this.queue.shift());
	}

	async remove(taskId: string): Promise<boolean> {
		return this.acquireLock(() => {
			const index = this.queue.findIndex((t) => t.taskId === taskId);
			if (index === -1) return false;
			this.queue.splice(index, 1);
			return true;
		});
	}

	getAll(): ComputeTicket[] {
		return [...this.queue];
	}

	// Check if a task is currently being processed
	isProcessing(): boolean {
		return this.processing;
	}

	setProcessing(value: boolean): void {
		this.processing = value;
	}
}

export const computeTribute = new ComputeTribute();

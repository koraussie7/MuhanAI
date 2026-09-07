export class ComputeTribute {
	queue = [];
	projectWeights = new Map();
	setProjectWeight(projectId, weight) {
		this.projectWeights.set(projectId, Math.max(0, Math.min(1, weight)));
	}
	submit(ticket) {
		this.queue.push(ticket);
		this.queue.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
			return (
				(this.projectWeights.get(b.projectId ?? "") ?? 0) -
				(this.projectWeights.get(a.projectId ?? "") ?? 0)
			);
		});
	}
	next() {
		return this.queue.shift();
	}
	getAll() {
		return [...this.queue];
	}
}
export const computeTribute = new ComputeTribute();
//# sourceMappingURL=tribute.js.map

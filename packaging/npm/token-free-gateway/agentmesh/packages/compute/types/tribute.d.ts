export interface ComputeTicket {
	taskId: string;
	projectId?: string;
	networkShare: number;
	personalShare: number;
	priority: "low" | "normal" | "high";
	status: "queued" | "running" | "completed" | "failed";
}
export declare class ComputeTribute {
	private queue;
	private projectWeights;
	setProjectWeight(projectId: string, weight: number): void;
	submit(ticket: ComputeTicket): void;
	next(): ComputeTicket | undefined;
	getAll(): ComputeTicket[];
}
export declare const computeTribute: ComputeTribute;
//# sourceMappingURL=tribute.d.ts.map

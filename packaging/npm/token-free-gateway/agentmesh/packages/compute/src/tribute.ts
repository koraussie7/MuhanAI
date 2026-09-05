export interface ComputeTicket {
  taskId: string;
  projectId?: string;
  networkShare: number;
  personalShare: number;
  priority: "low" | "normal" | "high";
  status: "queued" | "running" | "completed" | "failed";
}

export class ComputeTribute {
  private queue: ComputeTicket[] = [];
  private projectWeights = new Map<string, number>();

  setProjectWeight(projectId: string, weight: number): void {
    this.projectWeights.set(projectId, Math.max(0, Math.min(1, weight)));
  }

  submit(ticket: ComputeTicket): void {
    this.queue.push(ticket);
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
      return (this.projectWeights.get(b.projectId ?? "") ?? 0) - (this.projectWeights.get(a.projectId ?? "") ?? 0);
    });
  }

  next(): ComputeTicket | undefined {
    return this.queue.shift();
  }

  getAll(): ComputeTicket[] {
    return [...this.queue];
  }
}

export const computeTribute = new ComputeTribute();

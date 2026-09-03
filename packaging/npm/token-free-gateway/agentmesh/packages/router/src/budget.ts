export interface Budget { maxCost: number; maxLatencyMs: number }
export function withinBudget(cost: number, latencyMs: number, budget: Budget): boolean {
  return cost <= budget.maxCost && latencyMs <= budget.maxLatencyMs;
}

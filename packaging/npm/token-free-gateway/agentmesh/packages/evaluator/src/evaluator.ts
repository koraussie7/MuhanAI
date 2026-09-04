import type { AgentResult } from "@agentmesh/core";

export interface Evaluation { confidence: number; quality: number; relevant: boolean }
export function evaluate(result: AgentResult, question: string): Evaluation {
  const relevant = result.answer.toLowerCase().includes(question.toLowerCase().slice(0, 12));
  return { confidence: result.confidence, quality: result.error ? 0 : result.confidence, relevant };
}

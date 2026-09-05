import { AgentRunResult, CastResult } from "../../shared/types";
import { llmRouter } from "../../llm-router/src";

/**
 * Agent Cast: synthesizes multiple agent outputs into a final answer.
 * Can use voting, weighted confidence, or an LLM judge.
 */
export class AgentCast {
  async cast(
    question: string,
    agentResults: AgentRunResult[],
    options?: { strategy?: "best" | "ensemble" | "judge" }
  ): Promise<CastResult> {
    const strategy = options?.strategy ?? "judge";

    if (agentResults.length === 0) {
      return {
        finalAnswer: "No agents produced a result.",
        agentResults: [],
        consensusScore: 0,
        selectedAgents: [],
      };
    }

    if (agentResults.length === 1 || strategy === "best") {
      const best = [...agentResults].sort((a, b) => b.confidence - a.confidence)[0]!;
      return {
        finalAnswer: best.output,
        agentResults,
        consensusScore: best.confidence,
        selectedAgents: [best.agentId],
      };
    }

    // LLM-as-judge ensemble
    const candidates = agentResults
      .map(
        (r, i) =>
          `### Candidate ${i + 1} (agent: ${r.agentId}, confidence: ${r.confidence})\n${r.output}`
      )
      .join("\n\n");

    const judgePrompt = `You are a careful judge. Given the user question and multiple agent answers, produce the best final answer.
Merge complementary points, resolve conflicts conservatively, and stay accurate.

Question:
${question}

Candidates:
${candidates}

Write the final answer only.`;

    const judged = await llmRouter.generate({
      prompt: judgePrompt,
      temperature: 0.2,
    });

    const avgConfidence =
      agentResults.reduce((s, r) => s + r.confidence, 0) / agentResults.length;

    return {
      finalAnswer: judged.text,
      agentResults,
      consensusScore: avgConfidence,
      selectedAgents: agentResults.map((r) => r.agentId),
    };
  }
}

export const agentCast = new AgentCast();

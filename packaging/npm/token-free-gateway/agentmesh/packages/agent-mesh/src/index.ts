import {
  Agent,
  AgentExecutionContext,
  MeshExecuteParams,
} from "../../agent-core/src/types";
import { AgentRunResult } from "../../shared/types";
import { llmRouter } from "../../llm-router/src";
import { persistAgentRun } from "../../agent-core/src/run-store";

/**
 * Simple domain agent that uses the LLM router.
 */
export class DomainAgent implements Agent {
  constructor(public definition: import("../../agent-core/src/types").AgentDefinition) {}

  async run(ctx: AgentExecutionContext): Promise<AgentRunResult> {
    const knowledgeBlock = ctx.knowledge
      .map((k) => `- [${k.title}]: ${k.content.slice(0, 300)}`)
      .join("\n");

    const personalCtx = ctx.personalMcp
      ? await ctx.personalMcp.prompts.personalContext.render({
          query: ctx.question,
        })
      : "";

    const system = [
      this.definition.systemPrompt ??
        `You are ${this.definition.name}, an expert in ${this.definition.domain}.`,
      personalCtx ? `\nPersonal user context:\n${personalCtx}` : "",
      knowledgeBlock ? `\nRelevant knowledge:\n${knowledgeBlock}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Category: ${ctx.category.domain}${
      ctx.category.subdomain ? " / " + ctx.category.subdomain : ""
    }
Jurisdiction: ${ctx.category.jurisdiction?.join(", ") ?? "unspecified"}
Risk: ${ctx.category.riskLevel ?? "medium"}

Question:
${ctx.question}

Provide a clear, practical, and accurate answer. Cite knowledge when used.`;

    const response = await llmRouter.generate({
      system,
      prompt,
      temperature: 0.3,
    });

    const result: AgentRunResult = {
      agentId: this.definition.id,
      output: response.text,
      confidence: 0.75,
      sources: ctx.knowledge.map((k) => k.id),
      latencyMs: response.latencyMs,
    };

    // Persist run (no-op in memory mode)
    await persistAgentRun({
      agent: this.definition,
      userId: ctx.userId,
      question: ctx.question,
      result,
    });

    return result;
  }
}

export class AgentMesh {
  async execute(params: MeshExecuteParams): Promise<AgentRunResult[]> {
    const { question, context, agents, knowledge, personalMcp, userId } = params;

    if (agents.length === 0) {
      const general = new DomainAgent({
        id: "agent.general",
        name: "General Assistant",
        domain: "general",
      });
      return [
        await general.run({
          question,
          category: context,
          knowledge,
          personalMcp,
          userId,
        }),
      ];
    }

    const results = await Promise.all(
      agents.map((agent) =>
        agent.run({
          question,
          category: context,
          knowledge,
          personalMcp,
          userId,
        })
      )
    );

    return results;
  }
}

export const agentMesh = new AgentMesh();

/**
 * MuhanAI end-to-end demo
 * Run: npx tsx scripts/demo.ts
 */

import { categoryRouter } from "../packages/category-engine/src/router";
import { personalMcpRegistry } from "../packages/personal-mcp/src/server";
import { userKnowledgeStore } from "../packages/personal-mcp/src/user-object";
import {
  processUserActivity,
  toKnowledgeNode,
  knowledgeExtractor,
} from "../packages/knowledge-base/src/ingestion";
import { knowledgeGraph } from "../packages/knowledge-base/src/graph";
import { vectorStore } from "../packages/knowledge-base/src/retrieval";
import { personalKnowledgeService } from "../packages/personal-mcp/src/knowledge";
import { routeQuestion } from "../packages/agent-router/src";
import { UserActivity } from "../packages/shared/types";

async function main() {
  const userId = "user_demo_001";

  console.log("=== MuhanAI Demo ===\n");

  // 1. Ensure personal MCP / UserKnowledgeObject
  await userKnowledgeStore.getOrCreate(userId, {
    name: "Minh",
    languages: ["vi", "ko", "en"],
  });
  const mcp = await personalMcpRegistry.get(userId);
  console.log("Personal MCP URI examples:");
  console.log(" -", mcp.resources.knowledge.uri);
  console.log(" -", mcp.resources.memories.uri);
  console.log(" -", mcp.resources.expertise.uri);
  console.log();

  // 2. Simulate user activity → auto knowledge
  const activities: UserActivity[] = [
    {
      id: "act1",
      userId,
      type: "conversation",
      content:
        "베트남 다낭 임대차계약에서 보증금 반환 문제가 있습니다. 계약 종료 후 2개월이 지났는데도 보증금을 돌려주지 않아요.",
      timestamp: new Date(),
    },
    {
      id: "act2",
      userId,
      type: "conversation",
      content:
        "다낭 부동산 임대 계약서에 보증금 반환 조항이 어떻게 되어 있어야 안전한지 알려주세요.",
      timestamp: new Date(),
    },
  ];

  for (const activity of activities) {
    const node = await processUserActivity(
      activity,
      async (text) => categoryRouter.classify(text),
      async (ownerId, kn) => {
        await personalKnowledgeService.upsert(ownerId, kn);
        await vectorStore.upsert(kn);
      },
      async (params) => {
        await knowledgeGraph.connectKnowledge(params);
        // also bump expertise
        await userKnowledgeStore.addOrBoostExpertise(params.userId, {
          domain: params.category.domain,
          subdomain: params.category.subdomain,
          jurisdiction: params.category.jurisdiction,
          level: 0.2,
          evidenceCount: 1,
        });
      }
    );
    if (node) {
      console.log(`Ingested knowledge: [${node.categoryId}] ${node.title.slice(0, 60)}...`);
    }
  }
  console.log();

  // 3. Classify a new question
  const question =
    "다낭에서 집주인이 보증금을 안 돌려주면 법적으로 어떻게 대응해야 하나요?";
  const classification = await categoryRouter.classify(question);
  console.log("Classification:", JSON.stringify(classification, null, 2));
  console.log();

  // 4. Full route → Agent Mesh → Cast
  console.log("Routing question through Agent Mesh + Cast...\n");
  const result = await routeQuestion(question, userId);

  console.log("--- Category ---");
  console.log(result.category);
  console.log("\n--- Knowledge used ---", result.knowledgeUsed);
  console.log("\n--- Agent results ---");
  for (const ar of result.cast.agentResults) {
    console.log(`\n[${ar.agentId}] confidence=${ar.confidence}`);
    console.log(ar.output.slice(0, 300) + "...");
  }
  console.log("\n--- Final Cast Answer ---");
  console.log(result.cast.finalAnswer);
  console.log("\nConsensus:", result.cast.consensusScore);
  console.log("Selected agents:", result.cast.selectedAgents.join(", "));

  // 5. Personal context prompt
  console.log("\n--- Personal Context Prompt ---");
  console.log(await mcp.prompts.personalContext.render({ query: question }));
}

main().catch(console.error);

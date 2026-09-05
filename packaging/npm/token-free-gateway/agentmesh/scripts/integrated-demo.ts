/**
 * Full integration demo:
 *  - service.ts → getKnowledgeStore (memory|prisma)
 *  - embedding + vector index
 *  - hybrid search
 *  - agent mesh + AgentRun persistence
 *
 * Memory mode:
 *   npx tsx scripts/integrated-demo.ts
 *
 * Prisma mode:
 *   docker compose up -d postgres
 *   npx prisma migrate dev --name init
 *   PERSONAL_MCP_STORE=prisma npx tsx scripts/integrated-demo.ts
 */

import {
  createPersonalMcpForUser,
  addUserKnowledge,
  boostUserExpertise,
  searchUserKnowledge,
  getKnowledgeStoreMode,
} from "../packages/personal-mcp/src/service";
import { routeQuestion } from "../packages/agent-router/src";
import { listAgentRuns } from "../packages/agent-core/src/run-store";

async function main() {
  const mode = getKnowledgeStoreMode();
  console.log("═══════════════════════════════════════════");
  console.log("  MuhanAI Integrated Demo");
  console.log("  store =", mode);
  console.log("═══════════════════════════════════════════\n");

  const userId = "user_integrated_001";

  const { uko, mcp, created, storeMode } = await createPersonalMcpForUser(userId, {
    profile: {
      name: "Minh",
      languages: ["vi", "ko", "en"],
      preferredJurisdiction: ["VN", "KR"],
    },
  });

  console.log(created ? "Created UKO" : "Loaded UKO", {
    id: uko.id,
    storeMode,
    endpoint: mcp.endpoint,
  });

  await addUserKnowledge(userId, {
    title: "다낭 임대차 보증금 반환 절차",
    content:
      "베트남 다낭에서 임대차 계약 종료 후 보증금 반환이 지연되면 계약서의 반환 기한, 공제 항목, 서면 최고를 확인한다. 필요 시 인민법원 또는 조정 절차를 검토한다.",
    categoryId: "real-estate.rental",
    sourceType: "experience",
    confidence: 0.88,
    metadata: { jurisdiction: ["VN"], city: "Da Nang" },
  });

  await addUserKnowledge(userId, {
    title: "한-베트남 조세조약 거주자 판정",
    content:
      "국제세무에서 이중거주 시 조약상 tie-breaker(항구적 주거, 중대한 이해관계 중심지 등)를 적용한다.",
    categoryId: "tax.international-tax",
    sourceType: "experience",
    confidence: 0.82,
  });

  await boostUserExpertise(userId, {
    domain: "real-estate",
    subdomain: "rental",
    jurisdiction: ["VN"],
    level: 0.3,
  });

  console.log("\n--- Hybrid search: 보증금 ---");
  const hits = await searchUserKnowledge(userId, "보증금 반환", { limit: 5 });
  for (const h of hits) {
    console.log(
      `  [${h.source}] score=${h.score.toFixed(3)}  ${h.node.title}`
    );
  }

  console.log("\n--- routeQuestion ---");
  const result = await routeQuestion(
    "다낭에서 집주인이 보증금을 안 돌려주면 어떻게 해야 하나요?",
    userId
  );

  console.log("Category:", result.category.domain, result.category.subdomain);
  console.log("Knowledge used:", result.knowledgeUsed);
  console.log("Agents:", result.cast.selectedAgents.join(", "));
  console.log("Answer preview:\n", result.cast.finalAnswer.slice(0, 400));

  if (mode === "prisma") {
    const runs = await listAgentRuns({ userId, limit: 10 });
    console.log("\n--- Persisted AgentRuns ---");
    for (const r of runs) {
      console.log(
        `  ${r.id}  agent=${r.agentId}  conf=${r.confidence}  latency=${r.latencyMs}ms`
      );
    }
  } else {
    console.log("\n(AgentRun persistence active only when PERSONAL_MCP_STORE=prisma)");
  }

  console.log("\n✅ Done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

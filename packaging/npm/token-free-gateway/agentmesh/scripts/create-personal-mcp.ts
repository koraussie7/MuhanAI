/**
 * Personal MCP / UserKnowledgeObject creation demo
 *
 * Run:
 *   npx tsx scripts/create-personal-mcp.ts
 */

import {
  createPersonalMcpForUser,
  addUserKnowledge,
  addUserMemory,
  boostUserExpertise,
  buildPersonalContext,
  userKnowledgeStore,
} from "../packages/personal-mcp/src/service";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  MuhanAI — Personal MCP / UKO Creation");
  console.log("═══════════════════════════════════════════\n");

  // 1) Create UserKnowledgeObject + Personal MCP
  const { userId, uko, mcp, created } = await createPersonalMcpForUser(
    "user_minh_001",
    {
      profile: {
        name: "Minh",
        description: "Vietnam–Korea cross-border real estate & tax",
        languages: ["vi", "ko", "en"],
        preferredJurisdiction: ["VN", "KR"],
        timezone: "Asia/Ho_Chi_Minh",
      },
    }
  );

  console.log(created ? "✅ Created new UserKnowledgeObject" : "↩️  Loaded existing");
  console.log("   userId     :", userId);
  console.log("   uko.id     :", uko.id);
  console.log("   uko.version:", uko.version);
  console.log("   profile    :", JSON.stringify(uko.profile, null, 2));
  console.log();

  // 2) MCP endpoint & resources
  console.log("📡 Personal MCP");
  console.log("   endpoint   :", mcp.endpoint);
  console.log("   resources  :");
  for (const [key, res] of Object.entries(mcp.resources)) {
    console.log(`     - ${key}: ${res.uri}`);
  }
  console.log("   tools      :", mcp.tools.map((t) => t.name).join(", "));
  console.log();

  // 3) Seed knowledge (activity → knowledge)
  const kn1 = await addUserKnowledge(userId, {
    title: "다낭 임대차 보증금 반환",
    content:
      "베트남 다낭 임대차계약에서 계약 종료 후 보증금 반환이 지연되는 경우, 계약서상 반환 기한과 공제 사유를 먼저 확인해야 한다.",
    categoryId: "real-estate.rental",
    sourceType: "conversation",
    confidence: 0.85,
    metadata: { jurisdiction: ["VN"], city: "Da Nang" },
  });

  const kn2 = await addUserKnowledge(userId, {
    title: "VN-KR 이중과세 방지",
    content:
      "한-베트남 조세조약 적용 시 거주자 판정과 원천징수 세율이 핵심이다.",
    categoryId: "tax.international-tax",
    sourceType: "experience",
    confidence: 0.8,
    metadata: { jurisdiction: ["VN", "KR"] },
  });

  console.log("📚 Knowledge added:");
  console.log("  -", kn1.id, kn1.title);
  console.log("  -", kn2.id, kn2.title);
  console.log();

  // 4) Memory + Expertise
  await addUserMemory(userId, {
    content: "사용자는 다낭 오피스텔 임대 분쟁을 진행 중이며 보증금 이슈에 민감하다.",
    context: {
      domain: "real-estate",
      subdomain: "rental",
      jurisdiction: ["VN"],
      riskLevel: "medium",
    },
    importance: 0.9,
  });

  await boostUserExpertise(userId, {
    domain: "real-estate",
    subdomain: "rental",
    jurisdiction: ["VN"],
    level: 0.25,
  });

  await boostUserExpertise(userId, {
    domain: "tax",
    subdomain: "international-tax",
    jurisdiction: ["VN", "KR"],
    level: 0.2,
  });

  // 5) Snapshot & context prompt
  const snapshot = await mcp.snapshot();
  console.log("📸 Snapshot");
  console.log(JSON.stringify(snapshot, null, 2));
  console.log();

  const context = await buildPersonalContext(
    userId,
    "다낭 보증금 반환 어떻게 하나요?"
  );
  console.log("🧠 personalContext prompt\n");
  console.log(context);
  console.log();

  // 6) Resource list via MCP
  const knowledgeList = await mcp.resources.knowledge.list();
  const expertiseList = await mcp.resources.expertise.list();
  console.log("📦 mcp.resources.knowledge count:", (knowledgeList as unknown[]).length);
  console.log("📦 mcp.resources.expertise count:", (expertiseList as unknown[]).length);

  // 7) Tool call
  const searchResult = await mcp.callTool("searchKnowledge", {
    query: "보증금",
    limit: 3,
  });
  console.log("\n🔧 tool searchKnowledge →", JSON.stringify(searchResult, null, 2).slice(0, 400));

  // 8) Final UKO state
  const final = await userKnowledgeStore.get(userId);
  console.log("\n═══════════════════════════════════════════");
  console.log(" Final UserKnowledgeObject stats");
  console.log("═══════════════════════════════════════════");
  console.log(final?.stats);
  console.log("expertise:", final?.expertise.map((e) => `${e.domain}/${e.subdomain ?? "-"}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

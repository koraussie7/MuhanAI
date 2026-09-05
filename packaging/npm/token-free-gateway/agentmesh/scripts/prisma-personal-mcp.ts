/**
 * Prisma-backed Personal MCP demo
 *
 * Prerequisites:
 *   docker compose up -d postgres
 *   cp .env.example .env
 *   npx prisma migrate dev --name init
 *
 * Run:
 *   PERSONAL_MCP_STORE=prisma npx tsx scripts/prisma-personal-mcp.ts
 */

import { prisma } from "../packages/db/src/client";
import { PrismaUserKnowledgeStore } from "../packages/personal-mcp/src/prisma-store";
import { createPersonalMCP } from "../packages/personal-mcp/src/server";

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  Prisma ↔ Personal MCP integration test");
  console.log("═══════════════════════════════════════════\n");

  // Health check
  await prisma.$connect();
  console.log("✅ Connected to database\n");

  const store = new PrismaUserKnowledgeStore(prisma);
  const userId = "user_prisma_demo";

  // Create UKO
  const uko = await store.getOrCreate(userId, {
    profile: {
      name: "Minh (Prisma)",
      languages: ["vi", "ko", "en"],
      preferredJurisdiction: ["VN", "KR"],
      timezone: "Asia/Ho_Chi_Minh",
    },
  });
  console.log("UKO created:", uko.id, "version", uko.version);
  console.log("Profile:", uko.profile);

  // Knowledge
  const kn = await store.upsertKnowledge(userId, {
    title: "다낭 임대 보증금 (DB)",
    content: "Prisma로 저장된 다낭 보증금 관련 지식 노드입니다.",
    categoryId: "real-estate.rental",
    sourceType: "conversation",
    confidence: 0.9,
    metadata: { jurisdiction: ["VN"] },
  });
  console.log("\nKnowledge:", kn.id, kn.title);

  // Memory + Expertise
  await store.addMemory(userId, {
    content: "Prisma 연동 테스트 중 — 보증금 케이스",
    importance: 0.8,
    context: { domain: "real-estate", subdomain: "rental", jurisdiction: ["VN"] },
  });
  await store.addOrBoostExpertise(userId, {
    domain: "real-estate",
    subdomain: "rental",
    jurisdiction: ["VN"],
    level: 0.3,
  });

  // Snapshot
  const snap = await store.snapshot(userId);
  console.log("\nSnapshot:", JSON.stringify(snap, null, 2));

  // Logical Personal MCP still works on top (in-process);
  // resources read via in-memory path unless server is wired to Prisma store.
  const mcp = createPersonalMCP(userId);
  console.log("\nMCP endpoint:", mcp.endpoint);

  // Verify round-trip from DB
  const reloaded = await store.get(userId);
  console.log("\nReloaded knowledge count:", reloaded?.knowledge.length);
  console.log("Reloaded expertise:", reloaded?.expertise);
  console.log("Stats:", reloaded?.stats);

  await prisma.$disconnect();
  console.log("\n✅ Done");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

-- Agent lists for bot.muhanai.com.
-- Mutable per-user shopping/todo/custom documents with items and share codes.
-- Agents read and write these through the MCP tool surface.

CREATE TABLE "AgentList" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "listType" TEXT NOT NULL DEFAULT 'custom',
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentList_listType_valid" CHECK ("listType" IN ('shopping', 'todo', 'custom'))
);

CREATE INDEX "AgentList_userId_updatedAt_idx" ON "AgentList"("userId", "updatedAt");

ALTER TABLE "AgentList"
  ADD CONSTRAINT "AgentList_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentListItem" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION,
  "note" TEXT,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentListItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentListItem_quantity_non_negative" CHECK ("quantity" IS NULL OR "quantity" >= 0)
);

CREATE INDEX "AgentListItem_listId_done_position_idx"
  ON "AgentListItem"("listId", "done", "position");

ALTER TABLE "AgentListItem"
  ADD CONSTRAINT "AgentListItem_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "AgentList"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentListShare" (
  "id" TEXT NOT NULL,
  "listId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentListShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentListShare_code_key" ON "AgentListShare"("code");
CREATE INDEX "AgentListShare_listId_idx" ON "AgentListShare"("listId");
CREATE INDEX "AgentListShare_ownerId_idx" ON "AgentListShare"("ownerId");

ALTER TABLE "AgentListShare"
  ADD CONSTRAINT "AgentListShare_listId_fkey"
  FOREIGN KEY ("listId") REFERENCES "AgentList"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentListShare"
  ADD CONSTRAINT "AgentListShare_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

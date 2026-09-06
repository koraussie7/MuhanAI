/**
 * Singleton PrismaClient for the API service.
 *
 * Pattern: one instance per process. Hot-reload (tsx watch) reuses the
 * global cache to avoid the "too many clients" warning.
 */

import { PrismaClient } from "@prisma/client";
import { getLogger } from "@agentmesh/shared";

const logger = getLogger({ service: "api" });

declare global {
  // eslint-disable-next-line no-var
  var __muhanaiPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__muhanaiPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production"
      ? ["error", "warn"]
      : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__muhanaiPrisma = prisma;
  logger.info("prisma client initialized");
}

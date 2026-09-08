-- AlterTable: add passwordHash for bcrypt/argon2 hashed passwords
-- Generated 2026-09-07 from prisma/schema.prisma

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

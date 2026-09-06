-- MuhanAI credit wallet + immutable ledger.
-- Credits are internal platform points, not a blockchain token.

CREATE TABLE "CreditWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditWallet_userId_key" ON "CreditWallet"("userId");
CREATE INDEX "CreditWallet_balance_idx" ON "CreditWallet"("balance");

ALTER TABLE "CreditWallet"
  ADD CONSTRAINT "CreditWallet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "direction" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditLedger_idempotencyKey_key" ON "CreditLedger"("idempotencyKey");
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "CreditLedger"
  ADD CONSTRAINT "CreditLedger_direction_valid"
  CHECK ("direction" IN ('credit', 'debit'));
/**
 * Shared escrow types — used by TokenBankPage and TasksPage.
 */
export interface EscrowEntry {
  id: string;
  payer: string;
  payee: string;
  amount: string;
  token: "MINIMA" | "DADA";
  taskId: string;
  status: "open" | "released" | "refunded";
  anchorHash?: string;
  createdAt: number;
  releasedAt?: number;
}

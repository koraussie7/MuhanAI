/**
 * TokenBankPage.tsx — Token Bank UI (DADA + MINIMA)
 *
 * Implements Phase 1 of the muhanai.com/token-bank + Minima chain integration
 * (see HANDOFF_NEXT_AGENT.md §23). Phase 4 (external chain bridge) is
 * explicitly out of scope.
 *
 * Features:
 *   1. Live DADA + MINIMA balance from Minima node (via useMinima hook)
 *   2. Send form (recipient address + amount + memo)
 *   3. MDS anchor for each completed transaction receipt (Phantom RNPE-2)
 *   4. Transaction history with anchor verification badges
 *   5. Escrow create / release flow (Phase 3, gated behind env var)
 *
 * Dark theme: #09090b / #141418 / #14ebc0 / #06b6d4 (matches MinimaWalletPage).
 */
import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { useMinima } from "../hooks/useMinima";
import {
  Wallet, Send, Anchor, RefreshCw, Activity, Copy, ExternalLink,
  Clock, CheckCircle2, XCircle, ArrowDownToLine, ArrowUpFromLine,
  Lock, Unlock, AlertCircle,
} from "lucide-react";

interface BankTransaction {
  id: string;
  type: "send" | "receive" | "anchor" | "escrow";
  amount: string;
  token: "MINIMA" | "DADA";
  counterparty: string;
  memo: string;
  timestamp: number;
  txid?: string;
  anchorHash?: string;
  blockHeight?: number;
  status: "pending" | "confirmed" | "anchored" | "failed";
}

import type { EscrowEntry } from "../types/escrow";
import { escrowStore } from "../store/escrowStore";

export function TokenBankPage() {
  const { client, balance, transactions, loading, error, sendPayment, anchorHash, refresh } = useMinima();
  const [activeTab, setActiveTab] = useState<"wallet" | "send" | "history" | "escrow">("wallet");
  const [sendModal, setSendModal] = useState(false);
  const [sendForm, setSendForm] = useState({ to: "", amount: "", token: "DADA" as "DADA" | "MINIMA", memo: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Subscribe to escrow changes (TasksPage writes here too).
  const escrows = useSyncExternalStore(
    escrowStore.subscribe,
    escrowStore.getSnapshot,
    () => [],
  );
  const [anchorModal, setAnchorModal] = useState<{ open: boolean; hash: string | null }>({ open: false, hash: null });

  const enableEscrow = useMemo(
    () => import.meta.env.VITE_TOKEN_BANK_ESCROW === "true",
    [],
  );

  // Map raw hook transactions into our richer BankTransaction shape.
  const txList: BankTransaction[] = useMemo(() => {
    const base: BankTransaction[] = (transactions ?? []).map((t: any) => ({
      id: t.txid ?? String(Math.random()),
      type: "send" as const,
      amount: t.amount ?? "0",
      token: (t.token ?? "DADA") as "MINIMA" | "DADA",
      counterparty: t.to ?? "",
      memo: t.memo ?? "",
      timestamp: t.timestamp ?? Date.now(),
      txid: t.txid,
      status: "confirmed" as const,
    }));
    // Add escrows as transaction history entries for the history tab.
    for (const e of escrows) {
      base.push({
        id: `escrow-${e.id}`,
        type: "escrow",
        amount: e.amount,
        token: e.token,
        counterparty: e.payee,
        memo: `Task #${e.taskId} — escrow ${e.status}`,
        timestamp: Date.now(),
        status: e.status === "open" ? "pending" : e.status === "released" ? "anchored" : "failed",
        anchorHash: e.anchorHash,
      });
    }
    return base.sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, escrows]);

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr).catch(() => null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Send via minima-client
      const result = await sendPayment(sendForm.to, sendForm.amount, sendForm.token);
      // 2. Anchor the receipt hash on MDS (Phantom RNPE-2)
      const receipt = JSON.stringify({
        txid: result?.txid,
        to: sendForm.to,
        amount: sendForm.amount,
        token: sendForm.token,
        memo: sendForm.memo,
        ts: Date.now(),
      });
      const anchor = await anchorHash(receipt, "token-bank");
      setAnchorModal({ open: true, hash: anchor?.hash ?? null });
      setSendModal(false);
      setSendForm({ to: "", amount: "", token: "DADA", memo: "" });
      refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Phase 3 escrow skeleton — create + release. Real implementation would call
  // a multisig or smart-contract script via MDS; here we anchor a state record.
  const createEscrow = async (payee: string, amount: string, taskId: string) => {
    if (!enableEscrow) return;
    const id = `esc-${Date.now()}`;
    const anchor = await anchorHash(JSON.stringify({ id, payee, amount, taskId }), "token-bank-escrow").catch(() => null);
    escrowStore.add({
      id, payer: "self", payee, amount, token: "DADA", taskId,
      status: "open", anchorHash: anchor?.hash, createdAt: Date.now(),
    });
  };
  const releaseEscrow = async (id: string) => {
    // Anchor the release receipt too so the resolution itself is on MDS.
    const release = JSON.stringify({ escrowId: id, action: "manual-release", ts: Date.now() });
    const a = await anchorHash(release, "escrow-release").catch(() => null);
    escrowStore.update(id, { status: "released", releasedAt: Date.now(), anchorHash: a?.hash ?? undefined });
    refresh();
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#14ebc0] to-[#06b6d4] bg-clip-text text-transparent">
              Token Bank
            </h1>
            <p className="text-[#71717a] text-sm mt-1">
              DADA + MINIMA balances, sends, and MDS anchors on the Minima chain.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 hover:bg-[#141418] rounded-lg transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[#27272a]">
          {(["wallet", "send", "history", enableEscrow ? "escrow" : null]
            .filter(Boolean) as ("wallet" | "send" | "history" | "escrow")[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition ${
                activeTab === tab
                  ? "text-[#14ebc0] border-b-2 border-[#14ebc0]"
                  : "text-[#71717a] hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Wallet tab — balances */}
        {activeTab === "wallet" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BalanceCard
              token="MINIMA"
              amount={balance?.token === "MINIMA" ? balance.amount : "0"}
              icon={<Activity className="w-6 h-6" />}
            />
            <BalanceCard
              token="DADA"
              amount={balance?.token === "DADA" ? balance.amount : balance?.amount ?? "0"}
              icon={<Wallet className="w-6 h-6" />}
            />
            <div className="md:col-span-2 bg-[#141418] rounded-xl p-6 border border-[#27272a]">
              <h2 className="text-sm font-semibold text-[#71717a] mb-3">Recent activity</h2>
              {txList.length === 0 ? (
                <p className="text-[#52525b] text-sm">No transactions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {txList.slice(0, 5).map((tx) => (
                    <TxRow key={tx.id} tx={tx} onCopy={copyAddress} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Send tab — single-step send + anchor */}
        {activeTab === "send" && (
          <form onSubmit={handleSend} className="bg-[#141418] rounded-xl p-6 border border-[#27272a] space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowUpFromLine className="w-5 h-5 text-[#14ebc0]" /> Send tokens
            </h2>
            <Field label="Recipient address">
              <input
                type="text"
                value={sendForm.to}
                onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })}
                placeholder="MxABC...123"
                required
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 font-mono text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount">
                <input
                  type="number"
                  step="0.0001"
                  value={sendForm.amount}
                  onChange={(e) => setSendForm({ ...sendForm, amount: e.target.value })}
                  placeholder="0.0000"
                  required
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 font-mono text-sm"
                />
              </Field>
              <Field label="Token">
                <select
                  value={sendForm.token}
                  onChange={(e) => setSendForm({ ...sendForm, token: e.target.value as "DADA" | "MINIMA" })}
                  className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-sm"
                >
                  <option value="DADA">DADA</option>
                  <option value="MINIMA">MINIMA</option>
                </select>
              </Field>
            </div>
            <Field label="Memo (anchored on MDS)">
              <input
                type="text"
                value={sendForm.memo}
                onChange={(e) => setSendForm({ ...sendForm, memo: e.target.value })}
                placeholder="Optional"
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg p-2.5 text-sm"
              />
            </Field>
            {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting || !client}
                className="flex-1 bg-gradient-to-r from-[#14ebc0] to-[#06b6d4] text-[#09090b] font-semibold rounded-lg p-2.5 hover:opacity-90 transition disabled:opacity-40"
              >
                {submitting ? "Sending + anchoring..." : "Send + Anchor"}
              </button>
              <p className="text-xs text-[#71717a]">
                Receipt will be anchored via MDS (Phantom RNPE-2).
              </p>
            </div>
          </form>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div className="bg-[#141418] rounded-xl p-6 border border-[#27272a]">
            <h2 className="text-sm font-semibold text-[#71717a] mb-3">All transactions</h2>
            {txList.length === 0 ? (
              <p className="text-[#52525b] text-sm">No history.</p>
            ) : (
              <ul className="space-y-2">
                {txList.map((tx) => (
                  <TxRow key={tx.id} tx={tx} onCopy={copyAddress} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Escrow tab (Phase 3, gated) */}
        {activeTab === "escrow" && enableEscrow && (
          <div className="bg-[#141418] rounded-xl p-6 border border-[#27272a] space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#06b6d4]" /> Escrow
            </h2>
            <p className="text-sm text-[#71717a]">
              Lock DADA against a task. Released upon task completion; refundable otherwise.
            </p>
            <EscrowForm onCreate={createEscrow} />
            <div className="space-y-2 mt-4">
              {escrows.length === 0 ? (
                <p className="text-[#52525b] text-sm">No escrows.</p>
              ) : (
                escrows.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between bg-[#09090b] rounded-lg p-3 border border-[#27272a]"
                  >
                    <div>
                      <p className="text-sm font-mono">#{e.taskId} — {e.amount} {e.token}</p>
                      <p className="text-xs text-[#71717a] font-mono">
                        to {e.payee.slice(0, 12)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          e.status === "open"
                            ? "bg-yellow-900/40 text-yellow-300"
                            : e.status === "released"
                            ? "bg-green-900/40 text-green-300"
                            : "bg-red-900/40 text-red-300"
                        }`}
                      >
                        {e.status}
                      </span>
                      {e.status === "open" && (
                        <button
                          onClick={() => releaseEscrow(e.id)}
                          className="text-xs px-2 py-1 bg-[#14ebc0] text-[#09090b] rounded font-semibold"
                        >
                          Release
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Anchor receipt modal */}
        {anchorModal.open && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => setAnchorModal({ open: false, hash: null })}
          >
            <div
              className="bg-[#141418] border border-[#27272a] rounded-xl p-6 max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <Anchor className="w-5 h-5 text-[#14ebc0]" />
                <h3 className="font-semibold">Anchored on Minima</h3>
              </div>
              <p className="text-xs text-[#71717a] mb-2">Receipt hash</p>
              <code className="block bg-[#09090b] rounded p-3 text-xs font-mono break-all">
                {anchorModal.hash ?? "(pending)"}
              </code>
              <button
                onClick={() => setAnchorModal({ open: false, hash: null })}
                className="mt-4 w-full bg-[#27272a] rounded-lg p-2 hover:bg-[#3f3f46] transition text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[#71717a] mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function BalanceCard({
  token, amount, icon,
}: { token: "MINIMA" | "DADA"; amount: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#141418] rounded-xl p-6 border border-[#27272a]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-[#71717a]">
          {icon}
          <span className="text-sm">{token} balance</span>
        </div>
        <span className="text-xs px-2 py-0.5 bg-[#27272a] rounded font-mono">{token}</span>
      </div>
      <p className="text-3xl font-bold font-mono text-[#14ebc0]">{amount}</p>
    </div>
  );
}

function TxRow({ tx, onCopy }: { tx: BankTransaction; onCopy: (s: string) => void }) {
  const Icon = tx.type === "send" ? ArrowUpFromLine :
               tx.type === "receive" ? ArrowDownToLine :
               tx.type === "anchor" ? Anchor :
               Lock;
  return (
    <li className="flex items-center justify-between bg-[#09090b] rounded-lg p-3 border border-[#27272a]">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="w-4 h-4 text-[#71717a] shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-mono truncate">
            {tx.type === "escrow" ? tx.memo : `${tx.amount} ${tx.token} → ${tx.counterparty.slice(0, 14)}...`}
          </p>
          {tx.memo && tx.type !== "escrow" && (
            <p className="text-xs text-[#71717a] truncate">{tx.memo}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {tx.anchorHash && (
          <span title={`Anchored: ${tx.anchorHash}`} className="text-[#14ebc0]">
            <Anchor className="w-4 h-4" />
          </span>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            tx.status === "anchored"
              ? "bg-green-900/40 text-green-300"
              : tx.status === "confirmed"
              ? "bg-blue-900/40 text-blue-300"
              : tx.status === "pending"
              ? "bg-yellow-900/40 text-yellow-300"
              : "bg-red-900/40 text-red-300"
          }`}
        >
          {tx.status}
        </span>
        {tx.counterparty && (
          <button
            onClick={() => onCopy(tx.counterparty)}
            className="text-[#71717a] hover:text-white"
            title="Copy address"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function EscrowForm({ onCreate }: { onCreate: (payee: string, amount: string, taskId: string) => void }) {
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [taskId, setTaskId] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(payee, amount, taskId);
        setPayee(""); setAmount(""); setTaskId("");
      }}
      className="grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      <input
        type="text" placeholder="Payee address" value={payee}
        onChange={(e) => setPayee(e.target.value)} required
        className="bg-[#09090b] border border-[#27272a] rounded-lg p-2 font-mono text-sm"
      />
      <input
        type="number" placeholder="Amount" step="0.0001" value={amount}
        onChange={(e) => setAmount(e.target.value)} required
        className="bg-[#09090b] border border-[#27272a] rounded-lg p-2 font-mono text-sm"
      />
      <div className="flex gap-2">
        <input
          type="text" placeholder="Task ID" value={taskId}
          onChange={(e) => setTaskId(e.target.value)} required
          className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg p-2 font-mono text-sm"
        />
        <button
          type="submit"
          className="bg-[#06b6d4] text-[#09090b] font-semibold rounded-lg px-4 text-sm"
        >
          Lock
        </button>
      </div>
    </form>
  );
}

export default TokenBankPage;

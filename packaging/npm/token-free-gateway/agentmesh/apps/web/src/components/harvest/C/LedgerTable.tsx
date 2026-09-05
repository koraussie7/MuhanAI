import React from "react";

/**
 * LedgerTable — adapted from pur4v/p2ptokens ledger UI patterns.
 * Renders the contribution economy ledger: reward policy table + credit history.
 */
export interface LedgerRow {
  reason: string;
  credits: number;
}

export interface LedgerEntry {
  reason: string;
  credits: number;
  at: string;
}

export function LedgerTable({ table, entries }: { table: LedgerRow[]; entries: LedgerEntry[] }) {
  const maxCredits = Math.max(1, ...table.map((row) => row.credits));
  return (
    <div className="hc-ledger">
      <table className="hc-ledger-table">
        <thead>
          <tr>
            <th>활동</th>
            <th>보상</th>
            <th>비중</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row) => (
            <tr className="hc-ledger-row" key={row.reason}>
              <td>{row.reason}</td>
              <td className="hc-credits">+{row.credits}</td>
              <td>
                <div className="hc-ledger-bar">
                  <div
                    className="hc-ledger-bar-fill"
                    style={{ width: `${Math.round((row.credits / maxCredits) * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > 0 && (
        <ul className="hc-ledger-log">
          {entries.slice(0, 8).map((entry, i) => (
            <li key={i}>
              <span className="hc-ledger-log-reason">{entry.reason}</span>
              <span className="hc-ledger-log-at">{entry.at}</span>
              <strong className="hc-credits">+{entry.credits}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * RewardChip — contribution accounting chips (p2ptokens accounting pattern).
 */
export function RewardChip({ reason, credits }: { reason: string; credits: number }) {
  return (
    <span className="hc-reward-chip">
      <span className="hc-reward-chip-reason">{reason}</span>
      <strong>+{credits}</strong>
    </span>
  );
}

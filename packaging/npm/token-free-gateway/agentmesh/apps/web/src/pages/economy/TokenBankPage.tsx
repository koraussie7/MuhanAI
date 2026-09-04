import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

export function TokenBankPage() {
  const [table, setTable] = useState<{ reason: string; credits: number }[]>([]);
  const [balance, setBalance] = useState<{
    balance: number;
    entries: { reason: string; credits: number; at: string }[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    const fetchAll = () => {
      load<{ reason: string; credits: number }[]>("/api/rewards/table").then((d) => d && setTable(d));
      load<NonNullable<typeof balance>>("/api/rewards/anonymous").then((d) => {
        if (alive && d) setBalance(d);
      });
    };
    fetchAll();
    const timer = setInterval(fetchAll, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <Page title="Token Bank" subtitle="Contribution Economy">
      <StatGrid
        stats={[
          ["Balance", balance?.balance ?? 0],
          ["Entries", balance?.entries.length ?? 0],
        ]}
      />
      <div className="reward-grid">
        {table.map((row) => (
          <div className="reward-chip" key={row.reason}>
            <span>{row.reason}</span>
            <strong>+{row.credits}</strong>
          </div>
        ))}
      </div>
      {balance && balance.entries.length > 0 && (
        <ul className="reward-log">
          {balance.entries.map((e, i) => (
            <li key={i}>
              <span>{e.reason}</span>
              <strong>+{e.credits}</strong>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

// ---- Verification Center (live from /api/verify) ----

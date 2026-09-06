import { useEffect, useState } from "react";

type Props = {
  apiBase?: string;
  userId?: string;
  variant?: "card" | "inline";
};

type CreditResponse = {
  balance: string;
};

const formatCredits = (value: string) =>
  new Intl.NumberFormat("en-US").format(Number(value));

/**
 * Live balance chip driven by GET /api/credits/balance.
 * Renders as a card (default) or inline span (e.g. sidebar footer).
 */
export function CreditBalance({ apiBase = "", userId = "demo", variant = "card" }: Props) {
  const [balance, setBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${apiBase}/api/credits/balance?userId=${encodeURIComponent(userId)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? (r.json() as Promise<CreditResponse>) : Promise.reject(r)))
      .then((data) => {
        if (!cancelled) {
          setBalance(data.balance);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("—");
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, userId]);

  if (variant === "inline") {
    return (
      <span className="tabular-nums">
        {error ?? `${formatCredits(balance)} MHT`}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="text-xs opacity-60">MUHAN CREDITS</span>
      <strong className="tabular-nums">
        {error ?? formatCredits(balance)}
      </strong>
    </div>
  );
}

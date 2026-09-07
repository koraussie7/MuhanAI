import { useEffect, useState } from "react";
import { useGossipPulse } from "../hooks/useGossipPulse.js";

type Props = {
	apiBase?: string;
	userId?: string;
	variant?: "card" | "inline";
};

type CreditResponse = {
	balance: string;
};

/**
 * A credit PulseMessage payload from /api/pulse/stream.
 * Forward-compatible: the server emits these when a user's balance changes.
 * We trust the runtime `v === 1` check inside the hook to gate unknown shapes.
 */
interface CreditPulsePayload {
	userId?: string;
	balance: string | number;
	delta?: string | number;
	reason?: string;
}

const formatCredits = (value: string | number) =>
	new Intl.NumberFormat("en-US").format(Number(value));

export function CreditBalance({ apiBase = "", userId = "demo", variant = "card" }: Props) {
	const [balance, setBalance] = useState<string>("0");
	const [error, setError] = useState<string | null>(null);

	// Initial fetch — establishes the baseline balance.
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

	// Live updates via SSE. Filters by kind === "credit" so other PulseMessages
	// don't trigger re-renders. If the userId on the payload doesn't match,
	// the message is for a different user — skip.
	const { latest, status } = useGossipPulse({
		url: apiBase ? `${apiBase}/api/pulse/stream` : "/api/pulse/stream",
		kinds: ["credit"],
		bufferSize: 1,
	});

	useEffect(() => {
		if (latest?.kind !== "credit") return;
		const payload = latest.payload as CreditPulsePayload | null;
		if (!payload || typeof payload !== "object") return;
		// If the pulse targets a specific user, only apply when it matches.
		if (payload.userId && payload.userId !== userId) return;
		if (payload.balance === undefined || payload.balance === null) return;
		const next = String(payload.balance);
		setBalance(next);
		setError(null);
	}, [latest, userId]);

	// If the SSE stream is degraded (closed or unsupported), we still have the
	// initial fetch — no extra UI noise here. The "—" error already covers
	// a failed fetch.
	void status;

	if (variant === "inline") {
		return <span className="tabular-nums">{error ?? `${formatCredits(balance)} MHT`}</span>;
	}

	return (
		<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
			<span className="text-xs opacity-60">MUHAN CREDITS</span>
			<strong className="tabular-nums">{error ?? formatCredits(balance)}</strong>
		</div>
	);
}

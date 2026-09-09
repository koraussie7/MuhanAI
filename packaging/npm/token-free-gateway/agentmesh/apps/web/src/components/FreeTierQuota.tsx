import { Coins, Gauge, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * FreeTierQuota — Dashboard widget for the OmniRoute free-tier mesh.
 *
 * Pattern borrowed from OmniRoute's `/dashboard/free-tiers` card:
 * visualize per-provider quota exhaustion in a single glance so users can
 * pick the right model before they hit 429.
 *
 * Data source: GET /api/omniroute/free-tiers (services/api proxy that talks
 * to the OmniRoute MCP server when reachable, or returns a deterministic
 * stub when not — agents never crash because of this optional integration).
 *
 * Polling cadence:
 *   - First fetch on mount.
 *   - Refresh every 60 s (matches OmniRoute's typical cache TTL).
 *   - The component degrades silently when the server is unreachable.
 */

interface ProviderQuota {
	provider: string;
	limit: number;
	used: number;
	remaining: number;
	resetAt: string;
	tier: "free" | "metered";
}

interface FreeTiersPayload {
	source: "omniroute" | "fallback";
	aggregate: {
		monthlyTokens: number;
		monthlyTokensFormatted: string;
		providersOnline: number;
	};
	providers: ProviderQuota[];
	fetchedAt: string;
}

type Props = {
	apiBase?: string;
	refreshMs?: number;
	maxProviders?: number;
};

const DEFAULT_REFRESH_MS = 60_000;
const DEFAULT_MAX = 8;

function formatNumber(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return String(value);
}

function ratioColor(ratio: number): string {
	if (ratio >= 0.85) return "var(--cline-rose)";
	if (ratio >= 0.6) return "var(--cline-amber)";
	return "var(--cline-green)";
}

export function FreeTierQuota({
	apiBase = "",
	refreshMs = DEFAULT_REFRESH_MS,
	maxProviders = DEFAULT_MAX,
}: Props) {
	const [data, setData] = useState<FreeTiersPayload | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const controller = new AbortController();

		const load = async () => {
			try {
				const res = await fetch(`${apiBase}/api/omniroute/free-tiers`, {
					signal: controller.signal,
					credentials: "include",
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const json = (await res.json()) as FreeTiersPayload;
				if (!cancelled) {
					setData(json);
					setError(null);
				}
			} catch (err) {
				if (cancelled) return;
				if (err instanceof DOMException && err.name === "AbortError") return;
				setError("unavailable");
			}
		};

		load();
		const interval = setInterval(load, refreshMs);
		return () => {
			cancelled = true;
			controller.abort();
			clearInterval(interval);
		};
	}, [apiBase, refreshMs]);

	if (error) {
		return (
			<div className="freetier-quota-card">
				<div className="freetier-header">
					<Coins size={14} style={{ color: "var(--cline-green)" }} />
					<span className="freetier-title">FREE-TIER MESH</span>
					<span className="freetier-subtitle" style={{ color: "var(--cline-rose)" }}>
						offline
					</span>
				</div>
				<p className="freetier-empty">
					OmniRoute 메쉬가 응답하지 않습니다. <code>OMNIROUTE_DISABLED</code> 또는 MCP 서버 상태를
					확인하세요.
				</p>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="freetier-quota-card">
				<div className="freetier-header">
					<Coins size={14} style={{ color: "var(--cline-green)" }} />
					<span className="freetier-title">FREE-TIER MESH</span>
				</div>
				<p className="freetier-empty">불러오는 중…</p>
			</div>
		);
	}

	// Sort by remaining-ratio ascending so the most-exhausted providers are
	// at the top — that's the actionable signal the widget exists to surface.
	const sorted = [...data.providers].sort((a, b) => {
		const ra = a.remaining / Math.max(1, a.limit);
		const rb = b.remaining / Math.max(1, b.limit);
		return ra - rb;
	});

	const top = sorted.slice(0, maxProviders);
	const live = data.source === "omniroute";

	return (
		<div className="freetier-quota-card">
			<div className="freetier-header">
				<Coins size={14} style={{ color: "var(--cline-green)" }} />
				<span className="freetier-title">FREE-TIER MESH</span>
				<span className="freetier-subtitle">
					<Sparkles size={12} />
					<span>{data.aggregate.monthlyTokensFormatted} tokens / mo</span>
				</span>
				<span
					className="freetier-source-badge"
					style={{
						background: live ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)",
						color: live ? "var(--cline-green)" : "#94a3b8",
					}}
				>
					<Gauge size={11} />
					{live ? "LIVE" : "CACHED"}
				</span>
			</div>

			<p className="freetier-desc">
				OmniRoute 라우팅 메쉬가 현재 사용 가능한 무료 풀 ({data.aggregate.providersOnline}개). 남은
				비율이 낮은 풀부터 정렬되어 있어 다음 라우팅 결정에 즉시 활용할 수 있습니다.
			</p>

			<div className="freetier-rows">
				{top.map((p) => {
					const usedRatio = p.used / Math.max(1, p.limit);
					const remainingRatio = 1 - usedRatio;
					const color = ratioColor(usedRatio);
					return (
						<div key={p.provider} className="freetier-row">
							<div className="freetier-row-head">
								<span className="freetier-provider">{p.provider}</span>
								<span className="freetier-remaining" style={{ color }}>
									{Math.round(remainingRatio * 100)}% 남음
								</span>
							</div>
							<div className="freetier-bar">
								<div
									className="freetier-bar-fill"
									style={{
										width: `${Math.min(100, Math.max(0, usedRatio * 100))}%`,
										background: color,
									}}
								/>
							</div>
							<div className="freetier-row-foot">
								<span>
									{formatNumber(p.used)} / {formatNumber(p.limit)}
								</span>
								<span className="freetier-reset">
									reset{" "}
									{new Date(p.resetAt).toLocaleTimeString("ko-KR", {
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default FreeTierQuota;

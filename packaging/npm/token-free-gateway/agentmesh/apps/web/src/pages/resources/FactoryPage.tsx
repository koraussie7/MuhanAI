import { useCallback, useEffect, useMemo, useState } from "react";
import { A2UISurface } from "../../components/a2ui/A2UISurface";
import { parseJsonl, type A2UIMessage } from "../../components/a2ui/wire";
import { load } from "../../services/api";
import { SpecPage } from "../../components/common/spec";

// =====================================================================
// 1-Click Factory — dual-surface business node issuance.
// Lists spawned stores and renders each one's A2UI agent surface next to
// its human website URL, straight from the /api/factory/* endpoints.
// =====================================================================

interface SpawnedSite {
	success: boolean;
	subdomain: string;
	cid: string;
	websiteUrl: string;
	mcpUrl: string;
	cosmicStarId: string;
	/** A2UI JSONL wire for the store menu surface (agent-renderable UI). */
	a2uiJsonl?: string;
	createdAt: string;
}

interface SpawnForm {
	name: string;
	category: string;
	description: string;
	subdomain: string;
	phone: string;
	address: string;
	hours: string;
}

const EMPTY_FORM: SpawnForm = {
	name: "",
	category: "한식당",
	description: "",
	subdomain: "",
	phone: "",
	address: "",
	hours: "",
};

export function FactoryPage() {
	const [sites, setSites] = useState<SpawnedSite[]>([]);
	const [form, setForm] = useState<SpawnForm>(EMPTY_FORM);
	const [spawning, setSpawning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		load<{ total: number; sites: SpawnedSite[] }>("/api/factory/sites").then((d) => {
				if (d) setSites(d.sites);
		});
	}, []);

	useEffect(refresh, [refresh]);

	async function spawn() {
		if (!form.name.trim() || !form.subdomain.trim()) {
			setError("상호명과 서브도메인은 필수입니다.");
			return;
	}
		setSpawning(true);
		setError(null);
		try {
			const res = await fetch("/api/factory/spawn", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(form),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? `spawn failed (${res.status})`);
			}
			setForm(EMPTY_FORM);
			refresh();
	} catch (e) {
			setError(e instanceof Error ? e.message : "spawn failed");
	} finally {
			setSpawning(false);
	}
	}

	return (
	<SpecPage
			title="1-Click Factory"
			subtitle="원클릭으로 Hugo 웹사이트 + MCP 에이전트 인터페이스 + A2UI 화면을 발행합니다"
	>
			<section className="spec-panel">
				<h2>🚀 새 비즈니스 노드 발행</h2>
				<div className="factory-form">
					<label>
						상호명 *
						<input
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
							placeholder="초원식당"
						/>
					</label>
					<label>
						서브도메인 *
						<input
							value={form.subdomain}
							onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
							placeholder="shop1"
						/>
					</label>
					<label>
						업종
						<input
							value={form.category}
							onChange={(e) => setForm({ ...form, category: e.target.value })}
						/>
					</label>
					<label>
						소개
						<input
							value={form.description}
							onChange={(e) => setForm({ ...form, description: e.target.value })}
						/>
					</label>
					<label>
						전화
						<input
							value={form.phone}
							onChange={(e) => setForm({ ...form, phone: e.target.value })}
						/>
					</label>
					<label>
						주소
						<input
							value={form.address}
							onChange={(e) => setForm({ ...form, address: e.target.value })}
						/>
					</label>
					<label>
						영업시간
						<input
							value={form.hours}
							onChange={(e) => setForm({ ...form, hours: e.target.value })}
						/>
					</label>
				</div>
				{error && (
					<p role="alert" className="factory-error">
						{error}
					</p>
				)}
				<button className="btn-primary" disabled={spawning} onClick={spawn}>
					{spawning ? "발행 중..." : "🚀 AI 비즈니스 노드 발행"}
				</button>
			</section>

			<section className="spec-panel">
				<h2>📦 발행된 노드 ({sites.length})</h2>
				{sites.map((site) => (
					<SpawnedSiteCard key={site.subdomain} site={site} />
				))}
			</section>
	</SpecPage>
	);
}

function SpawnedSiteCard({ site }: { site: SpawnedSite }) {
	// Parse the A2UI wire once per render of this card.
	const ops: A2UIMessage[] | null = useMemo(() => {
		if (!site.a2uiJsonl) return null;
		try {
			return parseJsonl(site.a2uiJsonl);
	} catch {
			return null;
	}
	}, [site.a2uiJsonl]);

	return (
	<article className="factory-node">
			<header className="factory-node-head">
				<h3>{site.subdomain}</h3>
				<code className="factory-cid">{site.cid.slice(0, 18)}…</code>
			</header>
			<p className="factory-links">
				<a href={site.websiteUrl} target="_blank" rel="noreferrer">
					🌐 웹사이트
				</a>
				<a href={site.mcpUrl}>🤖 MCP</a>
			</p>
			{ops ? (
				<A2UISurface ops={ops} />
			) : (
				<p className="factory-no-a2ui">이 노드에는 A2UI 화면이 없습니다.</p>
			)}
	</article>
	);
}

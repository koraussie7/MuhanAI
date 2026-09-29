/**
 * Ontology page — concept graph inspector for the cosmos projection.
 *
 * Reads the three graph read models exposed by the gateway
 * (`/api/pythia/graph/{concepts,relations,events}`). Those endpoints are the
 * only ontology surface the dashboard is allowed to see: the projection is
 * one-way (TS authoring model → RDF/graph read models), so this page is
 * strictly read-only. Editing concepts happens upstream, never here.
 *
 * `getJson` in lib/pythia-client already swallows fetch failures and returns
 * an empty list, so the page degrades to an empty state instead of crashing
 * when the API or the graph is unavailable.
 */

import { Boxes, RefreshCw, Search, ShieldCheck, Spline, Waypoints } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type GraphConcept,
	type GraphEvent,
	type GraphRelation,
	listGraphConcepts,
	listGraphEvents,
	listGraphRelations,
} from "../lib/pythia-client";

type OntologyView = "concepts" | "relations" | "events";

const VIEWS: ReadonlyArray<{ id: OntologyView; label: string; icon: typeof Boxes }> = [
	{ id: "concepts", label: "개념", icon: Boxes },
	{ id: "relations", label: "관계", icon: Waypoints },
	{ id: "events", label: "이벤트", icon: Spline },
];

/** effectiveStatus is the trust ladder of the projection — colour it, don't hide it. */
const STATUS_TONE: Record<GraphConcept["effectiveStatus"], string> = {
	raw: "var(--cline-text-muted, #94a3b8)",
	validated: "var(--cline-sky, #38bdf8)",
	amplified: "var(--cline-amber, #fbbf24)",
};

const STATUS_LABEL: Record<GraphConcept["effectiveStatus"], string> = {
	raw: "RAW",
	validated: "VALIDATED",
	amplified: "AMPLIFIED",
};

const panelStyle: React.CSSProperties = {
	background: "var(--cline-panel, rgba(15,23,42,0.6))",
	border: "1px solid var(--cline-border, rgba(148,163,184,0.15))",
	borderRadius: 12,
};

const thStyle: React.CSSProperties = {
	textAlign: "left",
	padding: "8px 12px",
	fontSize: 11,
	letterSpacing: "0.06em",
	textTransform: "uppercase",
	color: "var(--cline-text-muted, #94a3b8)",
	borderBottom: "1px solid var(--cline-border, rgba(148,163,184,0.15))",
};

const tdStyle: React.CSSProperties = {
	padding: "8px 12px",
	fontSize: 13,
	color: "var(--cline-text, #e2e8f0)",
	borderBottom: "1px solid var(--cline-border, rgba(148,163,184,0.08))",
	verticalAlign: "top",
};

const HEADERS: Record<OntologyView, ReadonlyArray<string>> = {
	concepts: ["label", "domain", "status", "signal", "id"],
	relations: ["predicate", "source", "target", "strength"],
	events: ["kind", "source", "timestamp", "id"],
};

function EmptyRow({ columns, message }: { columns: number; message: string }) {
	return (
		<tr>
			<td
				colSpan={columns}
				style={{ ...tdStyle, textAlign: "center", padding: "28px 12px", opacity: 0.6 }}
			>
				{message}
			</td>
		</tr>
	);
}

export function OntologyPage() {
	const [view, setView] = useState<OntologyView>("concepts");
	const [concepts, setConcepts] = useState<GraphConcept[]>([]);
	const [relations, setRelations] = useState<GraphRelation[]>([]);
	const [events, setEvents] = useState<GraphEvent[]>([]);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [c, r, e] = await Promise.all([
				listGraphConcepts(),
				listGraphRelations(),
				listGraphEvents(),
			]);
			setConcepts(c);
			setRelations(r);
			setEvents(e);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const needle = query.trim().toLowerCase();

	const counts: Record<OntologyView, number> = {
		concepts: concepts.length,
		relations: relations.length,
		events: events.length,
	};

	const shownConcepts = useMemo(
		() =>
			!needle
				? concepts
				: concepts.filter((c) =>
						`${c.id} ${c.label} ${c.domain} ${c.effectiveStatus}`.toLowerCase().includes(needle),
					),
		[concepts, needle],
	);

	const shownRelations = useMemo(
		() =>
			!needle
				? relations
				: relations.filter((r) =>
						`${r.id} ${r.predicate} ${r.sourceId} ${r.targetId}`.toLowerCase().includes(needle),
					),
		[relations, needle],
	);

	const shownEvents = useMemo(
		() =>
			!needle
				? events
				: events.filter((e) => `${e.id} ${e.kind} ${e.source}`.toLowerCase().includes(needle)),
		[events, needle],
	);

	const shownCount: Record<OntologyView, number> = {
		concepts: shownConcepts.length,
		relations: shownRelations.length,
		events: shownEvents.length,
	};

	const active =
		VIEWS.find((v) => v.id === view) ??
		(VIEWS[0] as { id: OntologyView; label: string; icon: typeof Boxes });

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			<header style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
				<div style={{ flex: 1, minWidth: 240 }}>
					<h2 style={{ margin: 0, fontSize: 20, color: "var(--cline-text, #e2e8f0)" }}>온톨로지</h2>
					<p
						style={{
							margin: "4px 0 0",
							fontSize: 13,
							color: "var(--cline-text-muted, #94a3b8)",
						}}
					>
						cosmos 이벤트 로그에서 파생된 개념 그래프입니다. 이 화면은 읽기 전용 — 개념은
						upstream에서만 수정됩니다.
					</p>
				</div>
				<button
					type="button"
					onClick={() => void load()}
					disabled={loading}
					style={{
						...panelStyle,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "8px 14px",
						cursor: loading ? "wait" : "pointer",
						color: "var(--cline-text, #e2e8f0)",
						fontSize: 13,
					}}
				>
					<RefreshCw size={14} />
					{loading ? "불러오는 중" : "새로고침"}
				</button>
			</header>
			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
				{VIEWS.map((v) => {
					const Icon = v.icon;
					const isActive = v.id === view;
					return (
						<button
							key={v.id}
							type="button"
							onClick={() => setView(v.id)}
							style={{
								...panelStyle,
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "7px 12px",
								cursor: "pointer",
								fontSize: 13,
								borderColor: isActive
									? "var(--cline-sky, #38bdf8)"
									: "var(--cline-border, rgba(148,163,184,0.15))",
								color: isActive ? "var(--cline-sky, #38bdf8)" : "var(--cline-text-muted, #94a3b8)",
							}}
						>
							<Icon size={14} />
							{v.label}
							<span style={{ opacity: 0.7 }}>({counts[v.id]})</span>
						</button>
					);
				})}
				<label
					style={{
						...panelStyle,
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						padding: "7px 12px",
						marginLeft: "auto",
						flex: "0 1 260px",
					}}
				>
					<Search size={14} color="var(--cline-text-muted, #94a3b8)" />
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="filter…"
						style={{
							flex: 1,
							background: "transparent",
							border: "none",
							outline: "none",
							color: "var(--cline-text, #e2e8f0)",
							fontSize: 13,
						}}
					/>
				</label>
			</div>

			<div style={{ ...panelStyle, overflowX: "auto" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "10px 12px",
						fontSize: 12,
						color: "var(--cline-text-muted, #94a3b8)",
					}}
				>
					<ShieldCheck size={14} color="var(--cline-sky, #38bdf8)" />
					{active.label} · {shownCount[view]} / {counts[view]}
					{needle && <span>· filter “{query}”</span>}
				</div>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<tbody>
						<tr>
							{HEADERS[view].map((h) => (
								<th key={h} style={thStyle}>
									{h}
								</th>
							))}
						</tr>
						{view === "concepts" &&
							(shownConcepts.length === 0 ? (
								<EmptyRow columns={5} message="개념이 없습니다." />
							) : (
								shownConcepts.map((c) => (
									<tr key={c.id}>
										<td style={tdStyle}>{c.label}</td>
										<td style={{ ...tdStyle, opacity: 0.7 }}>{c.domain}</td>
										<td style={tdStyle}>
											<span
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: 6,
													fontSize: 11,
													letterSpacing: "0.06em",
													color: STATUS_TONE[c.effectiveStatus],
												}}
											>
												<span
													style={{
														width: 7,
														height: 7,
														borderRadius: "50%",
														background: STATUS_TONE[c.effectiveStatus],
													}}
												/>
												{STATUS_LABEL[c.effectiveStatus]}
											</span>
										</td>
										<td style={{ ...tdStyle, textAlign: "right" }}>{c.signalScore.toFixed(2)}</td>
										<td style={{ ...tdStyle, opacity: 0.5, fontFamily: "monospace" }}>{c.id}</td>
									</tr>
								))
							))}
						{view === "relations" &&
							(shownRelations.length === 0 ? (
								<EmptyRow columns={4} message="관계가 없습니다." />
							) : (
								shownRelations.map((r) => (
									<tr key={r.id}>
										<td style={tdStyle}>{r.predicate}</td>
										<td style={{ ...tdStyle, fontFamily: "monospace", opacity: 0.7 }}>
											{r.sourceId}
										</td>
										<td style={{ ...tdStyle, fontFamily: "monospace", opacity: 0.7 }}>
											{r.targetId}
										</td>
										<td style={{ ...tdStyle, textAlign: "right" }}>{r.strength.toFixed(2)}</td>
									</tr>
								))
							))}
						{view === "events" &&
							(shownEvents.length === 0 ? (
								<EmptyRow columns={4} message="이벤트가 없습니다." />
							) : (
								shownEvents.map((e) => (
									<tr key={e.id}>
										<td style={tdStyle}>{e.kind}</td>
										<td style={{ ...tdStyle, opacity: 0.7 }}>{e.source}</td>
										<td style={{ ...tdStyle, fontFamily: "monospace", opacity: 0.6 }}>
											{e.timestamp}
										</td>
										<td style={{ ...tdStyle, opacity: 0.5, fontFamily: "monospace" }}>{e.id}</td>
									</tr>
								))
							))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

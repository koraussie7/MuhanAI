import { useMemo } from "react";

const RELATIONS = ["supports", "derived_from", "impacts", "predicts"] as const;

export function OntologyExplorer() {
	const entities = useMemo(
	() => [
	{ id: "event", label: "Pythia Event", description: "Atomic research evidence emitted by an agent." },
	{ id: "forecast", label: "Pythia Forecast", description: "A probabilistic claim linked to supporting events." },
	{ id: "evidence", label: "LocalCrab Evidence", description: "Persisted evidence record with content-hash provenance." },
	{ id: "impact", label: "Impact Analysis", description: "Impact tier and affected domain annotation." },
	],
	[],
	);

	return (
	<section className="page-box">
	<header className="page-box-header">
	<div className="page-box-title-row">
	<span className="page-box-icon">◈</span>
	<h2 className="page-box-title">Ontology Explorer</h2>
	<span className="page-box-badge">Pythia</span>
	</div>
	<p className="page-box-subtitle">Canonical entities and graph relationships across Pythia, LocalCrab, and Colibri.</p>
	</header>
	<div className="page-box-body">
	<div className="peer-grid">
	{entities.map((entity) => (
	<article className="peer-card" key={entity.id}>
	<strong className="peer-name">{entity.label}</strong>
	<p className="dash-note">{entity.description}</p>
	</article>
	))}
	</div>
	<div className="chip-row" style={{ marginTop: 16 }}>
	{RELATIONS.map((relation) => <span className="cap-chip sm" key={relation}>{relation}</span>)}
	</div>
	</div>
	</section>
	);
}

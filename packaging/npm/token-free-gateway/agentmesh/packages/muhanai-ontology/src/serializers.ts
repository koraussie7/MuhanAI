/**
 * Serializers for the one-way RDF projection produced by `projectToRdf`.
 *
 * These render an `RdfProjection` as Turtle or N-Triples. They are the
 * second half of the one-way contract described in `projection.ts`: the
 * TypeScript `OntologyModel` / `PythiaOntology` stays the source of
 * truth, and whatever comes out of here is a *derived artifact* meant to
 * be fed to an external engine (e.g. `oo plan proposed.ttl`). There is
 * deliberately no reader in this module — a round trip would let two
 * truths drift apart.
 *
 * No dependencies: everything is a string builder.
 */

/**
 * Minimal structural view of an `RdfProjection`.
 *
 * `projectToRdf` performs the rendering itself, so a projection carries
 * pre-rendered `turtle` / `ntriples` strings and a `tripleCount` rather
 * than a structured triple array. The optional `triples` field keeps
 * these serializers usable for callers that build a triple list by hand.
 */
interface ProjectionLike {
	readonly turtle?: string;
	readonly ntriples?: string;
	readonly triples?: readonly TripleLike[];
}

/** Subject / predicate / object, as accepted by both serializers. */
export interface TripleLike {
	readonly subject: Term;
	readonly predicate: Term;
	readonly object: Term;
}

/** A term is either an IRI, a literal, or a node reference. */
export type Term =
	| string
	| {
			/** `"iri"` for resources, `"literal"` for literals, `"bnode"` for blank nodes. */
			readonly type?: "iri" | "literal" | "bnode";
			readonly value: string;
			/** Datatype IRI, literals only. */
			readonly datatype?: string;
	  };

/** The four prefixes every projection is expected to mention. */
export const STANDARD_PREFIXES: Readonly<Record<string, string>> = {
	rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
	rdfs: "http://www.w3.org/2000/01/rdf-schema#",
	owl: "http://www.w3.org/2002/07/owl#",
	xsd: "http://www.w3.org/2001/XMLSchema#",
};

export interface SerializeOptions {
	/**
	 * Extra prefixes available for CURIE compression, e.g.
	 * `{ muhanai: "https://muhanai.com/ont/" }`. Only prefixes that are
	 * actually used end up in the output.
	 */
	readonly prefixes?: Readonly<Record<string, string>>;
	/** Emit the loss ledger as `muhanai:`-free Turtle comments. Default `true`. */
	readonly annotateLosses?: boolean;
}

/** Heuristic: an unadorned string containing a scheme separator is an IRI. */
function isIriString(value: string): boolean {
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("_:");
}

/** Turn a term into its Turtle/N-Triples surface form. */
export function formatTerm(term: Term, compress: (iri: string) => string): string {
	if (typeof term === "string") {
		if (isIriString(term)) return compress(term);
		return quoteLiteral(term);
	}
	if (term.type === "literal" || (!term.type && !isIriString(term.value))) {
		return quoteLiteral(term.value, term.datatype);
	}
	if (term.type === "bnode") return compress(term.value);
	return compress(term.value);
}

function quoteLiteral(value: string, datatype?: string): string {
	const escaped = value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
	const body = `"${escaped}"`;
	if (!datatype) return body;
	return datatype.startsWith("http") ? `${body}^^<${datatype}>` : `${body}^^${datatype}`;
}

/** Build a CURIE compressor over the supplied prefix table. */
function makeCompressor(prefixes: Readonly<Record<string, string>>): (iri: string) => string {
	const table = Object.entries(prefixes)
		.filter(([name]) => /^[A-Za-z][A-Za-z0-9-]*$/.test(name))
		.sort((a, b) => b[1].length - a[1].length);
	return (iri: string) => {
		if (iri.startsWith("_:")) return iri;
		for (const [name, namespace] of table) {
			if (iri.startsWith(namespace) && iri.length > namespace.length) {
				return `${name}:${iri.slice(namespace.length)}`;
			}
		}
		return `<${iri}>`;
	};
}

/** N-Triples: one absolute-IRI triple per line, no prefixes, always terminated. */
export function toNTriples(projection: ProjectionLike): string {
	// A real `RdfProjection` already carries the rendered body. Delegating
	// keeps the two renderers from drifting apart.
	if (typeof projection.ntriples === "string") return projection.ntriples;
	const compress = makeCompressor({});
	return (projection.triples ?? [])
		.map(
			(triple) =>
				`${formatTerm(triple.subject, compress)} ${formatTerm(triple.predicate, compress)} ${formatTerm(triple.object, compress)} .`,
		)
		.join("\n");
}

/** Turtle: standard prefixes, then the same triples, optionally annotated. */
export function toTurtle(
	projection: ProjectionLike & {
		losses?: readonly {
			path: string;
			construct: string;
			projection: string | null;
			gap: string;
			severity: string;
		}[];
	},
	options: SerializeOptions = {},
): string {
	// Prefer the projection's own rendering, which already emits the
	// derived-artifact notice and the sorted prefix block.
	const triples = projection.triples;
	if (!triples && typeof projection.turtle === "string") {
		return projection.turtle;
	}
	const candidates = { ...STANDARD_PREFIXES, ...(options.prefixes ?? {}) };
	const compress = makeCompressor(candidates);
	const lines: string[] = [];

	for (const [name, namespace] of Object.entries(candidates).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) continue;
		if (!(triples ?? []).some((t) => String(t.subject).includes(namespace))) continue;
		lines.push(`@prefix ${name}: <${namespace}> .`);
	}
	if (lines.length > 0) lines.push("");

	for (const triple of triples ?? []) {
		lines.push(
			`${formatTerm(triple.subject, compress)} ${formatTerm(triple.predicate, compress)} ${formatTerm(triple.object, compress)} .`,
		);
	}

	if (options.annotateLosses !== false && projection.losses && projection.losses.length > 0) {
		lines.push("");
		for (const loss of projection.losses) {
			lines.push(`# loss [${loss.severity}] ${loss.construct} at ${loss.path} — ${loss.gap}`);
		}
	}

	return `${lines.join("\n")}\n`;
}

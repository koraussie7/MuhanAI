/**
 * One-way RDF projection of the MuhanAI ontology model.
 *
 * ## Why this file exists
 *
 * `OntologyModel` is a TypeScript-first, closed-world record model:
 * `ValueType` is `string | number | boolean | string[]`, `required` means
 * "this record must carry the key", and `identity` means "this key is the
 * record's primary key". OWL/RDF is a different kind of world: open,
 * set-based, and with no native notion of a record, a key, or an edge that
 * carries data. There is no lossless bidirectional mapping between them and
 * there never will be.
 *
 * So the mismatch is not solved by writing a better converter. It is
 * dissolved by fixing the direction:
 *
 *  1. **The event log is the only source of truth.** cosmos-core already
 *     states this (`types.ts`: "Nothing is mutated in place; graph/state/
 *     reaction aggregates are *projections* rebuilt from the log"). RDF is
 *     one more projection of that same log, so it cannot become a source of
 *     truth by construction — the log can always rebuild it.
 *  2. **There is no reverse function.** This module exports projectors only.
 *     Nothing here reads RDF back into `OntologyModel`. A test asserts that
 *     no `fromRdf`-shaped export exists.
 *  3. **Nothing is lost silently.** Every construct that cannot be expressed
 *     1:1 gets a `LossEntry` naming the path, the substitute construct, and
 *     the gap. The ledger is machine-readable so CI can gate on it.
 *  4. **The output is stamped as derived.** The Turtle carries a warning and
 *     an optional `sourceRevision` so a hand-edited artifact is detectable.
 *
 * `canonicalize()` is exported so callers can hash the source model for that
 * stamp without this package depending on a crypto library.
 *
 * MuhanAI-authored surface. Not part of the vendored `ontograph-core` subset
 * described in `NOTICE.md`.
 */

import type {
	OntologyEntity,
	OntologyModel,
	OntologyProperty,
	OntologyRelation,
	ValueType,
} from "./model.js";

/** Default namespace for the `muhanai:` prefix used by `pythia.ts` ids. */
export const DEFAULT_NAMESPACE = "https://muhanai.dev/ontology#";

const RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL_NS = "http://www.w3.org/2002/07/owl#";
const XSD_NS = "http://www.w3.org/2001/XMLSchema#";
const SH_NS = "http://www.w3.org/ns/shacl#";

/**
 * How bad a substitution is.
 *
 * - `structural` — the information survives, but lives in a different RDF
 *   construct than a naive reader would expect. A consumer that reads both
 *   the OWL and the SHACL parts of the projection recovers everything.
 * - `semantic` — the RDF construct is *not* equivalent to the source
 *   construct even when both are read together. It needs a human decision.
 */
export type LossSeverity = "structural" | "semantic";

/** One construct that did not map 1:1. */
export interface LossEntry {
	/** Dotted path into the source model, e.g. `entities[0].properties[3].identity`. */
	path: string;
	/** The source construct. */
	construct: string;
	/** What the projection emits instead (`null` when dropped outright). */
	projection: string | null;
	/** What the substitution gets wrong. */
	gap: string;
	severity: LossSeverity;
}

/** A derived, read-only RDF rendering of an `OntologyModel`. */
export interface RdfProjection {
	/** Deterministic Turtle. Derived artifact — never an input. */
	turtle: string;
	/** Deterministic N-Triples of the same triples. */
	ntriples: string;
	/** Every non-1:1 substitution. Empty means fully lossless. */
	losses: LossEntry[];
	/** True when any entry has `severity: "semantic"`. Gate CI on this. */
	hasSemanticLoss: boolean;
	/** Number of triples emitted. */
	tripleCount: number;
}

export interface ProjectionOptions {
	/** IRI that the `muhanai:` prefix expands to. */
	namespace?: string;
	/** Extra CURIE prefixes so ids from other vocabularies resolve. */
	prefixes?: Record<string, string>;
	/**
	 * Revision identifier of the source model (e.g. a log sequence or the
	 * sha256 of `canonicalize(model)`). Stamped into the ontology header so
	 * an artifact can be traced back and hand-edits detected.
	 */
	sourceRevision?: string;
}

interface Triple {
	subject: string;
	predicate: string;
	object: string;
	objectKind: "iri" | "literal";
	datatype?: string;
}

const IRI_SAFE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `ValueType` → the XSD datatype that carries the same value space. */
const XSD_TYPE: Record<ValueType, string> = {
	string: `${XSD_NS}string`,
	number: `${XSD_NS}double`,
	boolean: `${XSD_NS}boolean`,
	"string[]": `${XSD_NS}string`,
};

/**
 * Key inventories, so a field added to `model.ts` cannot slip past this
 * projection unnoticed. `KEY_COVERAGE_EXHAUSTIVE` stops compiling when an
 * interface gains a key that the array below does not list; the coverage
 * test then fails until the new key is either mapped or given a
 * `LossEntry`.
 */
export const ENTITY_KEYS = ["id", "label", "properties"] as const;
export const PROPERTY_KEYS = ["name", "type", "required", "identity", "description"] as const;
export const RELATION_KEYS = ["id", "source", "target", "label", "properties"] as const;
export const VALUE_TYPES = ["string", "number", "boolean", "string[]"] as const;

type Missing<T, K extends readonly string[]> = Exclude<keyof T, K[number]>;

export const KEY_COVERAGE_EXHAUSTIVE: [
	Missing<OntologyEntity, typeof ENTITY_KEYS> extends never ? true : false,
	Missing<OntologyProperty, typeof PROPERTY_KEYS> extends never ? true : false,
	Missing<OntologyRelation, typeof RELATION_KEYS> extends never ? true : false,
	Exclude<ValueType, (typeof VALUE_TYPES)[number]> extends never ? true : false,
] = [true, true, true, true];

/** A prefix map plus the namespace that bare local names land in. */
interface Context {
	namespace: string;
	prefixes: Record<string, string>;
}

function defaultPrefixes(
	namespace: string,
	extra?: Record<string, string>,
): Record<string, string> {
	return {
		muhanai: namespace,
		rdf: RDF_NS,
		rdfs: RDFS_NS,
		owl: OWL_NS,
		xsd: XSD_NS,
		sh: SH_NS,
		...extra,
	};
}

/** Expand `muhanai:pythia-node`, an absolute IRI, or a bare local name. */
function expandIri(value: string, context: Context): string {
	if (ABSOLUTE_IRI.test(value)) return value;
	const separator = value.indexOf(":");
	if (separator > 0) {
		const base = context.prefixes[value.slice(0, separator)];
		if (base) return `${base}${value.slice(separator + 1)}`;
	}
	return `${context.namespace}${localName(value)}`;
}

/** Turtle local names cannot carry arbitrary characters. */
function localName(name: string): string {
	return IRI_SAFE.test(name) ? name : name.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function escapeLiteral(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

function compareTriples(a: Triple, b: Triple): number {
	if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
	if (a.predicate !== b.predicate) return a.predicate < b.predicate ? -1 : 1;
	if (a.object !== b.object) return a.object < b.object ? -1 : 1;
	return 0;
}

/**
 * Deterministic, hashable rendering of a model. Callers hash this (sha256,
 * `Bun.hash`, …) and pass the result as `sourceRevision`, which keeps this
 * package free of a crypto dependency while still stamping artifacts.
 * Sorted by id, so key order in the source object cannot change the hash.
 */
export function canonicalize(model: OntologyModel): string {
	const entities = [...model.entities]
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
		.map((entity) => ({
			id: entity.id,
			label: entity.label,
			properties: entity.properties.map(canonicalProperty),
		}));
	const relations = [...model.relations]
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
		.map((relation) => ({
			id: relation.id,
			source: relation.source,
			target: relation.target,
			label: relation.label,
			properties: (relation.properties ?? []).map(canonicalProperty),
		}));
	return JSON.stringify({ version: 1, entities, relations });
}

function canonicalProperty(field: OntologyProperty): Record<string, unknown> {
	return {
		name: field.name,
		type: field.type,
		...(field.required === undefined ? {} : { required: field.required }),
		...(field.identity === undefined ? {} : { identity: field.identity }),
		...(field.description === undefined ? {} : { description: field.description }),
	};
}

// ---------------------------------------------------------------------------
// Vocabulary terms, spelled once so a typo cannot become a silent no-op.
// ---------------------------------------------------------------------------

const RDF_TYPE = `${RDF_NS}type`;
const RDFS_LABEL = `${RDFS_NS}label`;
const RDFS_COMMENT = `${RDFS_NS}comment`;
const RDFS_DOMAIN = `${RDFS_NS}domain`;
const RDFS_RANGE = `${RDFS_NS}range`;
const OWL_ONTOLOGY = `${OWL_NS}Ontology`;
const OWL_CLASS = `${OWL_NS}Class`;
const OWL_OBJECT_PROPERTY = `${OWL_NS}ObjectProperty`;
const OWL_DATATYPE_PROPERTY = `${OWL_NS}DatatypeProperty`;
const OWL_ANNOTATION_PROPERTY = `${OWL_NS}AnnotationProperty`;
const OWL_HAS_KEY = `${OWL_NS}hasKey`;
const SH_NODE_SHAPE = `${SH_NS}NodeShape`;
const SH_PROPERTY_SHAPE = `${SH_NS}PropertyShape`;
const SH_TARGET_CLASS = `${SH_NS}targetClass`;
const SH_PROPERTY = `${SH_NS}property`;
const SH_PATH = `${SH_NS}path`;
const SH_DATATYPE = `${SH_NS}datatype`;
const SH_MIN_COUNT = `${SH_NS}minCount`;
const SH_MAX_COUNT = `${SH_NS}maxCount`;
const XSD_INTEGER = `${XSD_NS}integer`;
const XSD_STRING = `${XSD_NS}string`;

/** Local name of the annotation property that carries `sourceRevision`. */
const REVISION_PROPERTY = "sourceRevision";

/** Warning carried by every projection, as a `#` comment and as `rdfs:comment`. */
export const DERIVED_NOTICE =
	"DERIVED ARTIFACT - do not edit by hand. Generated from the MuhanAI ontology " +
	"source by @muhanai/ontology projection.ts; regenerate rather than patch.";

/**
 * Source keys the projection carries unconditionally.
 *
 * The complement is what the loss ledger must cover: `required` and
 * `identity` always produce a `LossEntry` when present. The coverage test
 * exercises every key listed in `ENTITY_KEYS`/`PROPERTY_KEYS`/`RELATION_KEYS`
 * and asserts it is either here or named by a loss entry, so a key added to
 * `model.ts` cannot reach the projection without a decision on the record.
 */
export const MAPPED_KEYS = {
	entity: ["id", "label", "properties"],
	property: ["name", "type", "description"],
	relation: ["id", "source", "target", "label", "properties"],
} as const;

// ---------------------------------------------------------------------------
// Triple construction
// ---------------------------------------------------------------------------

function iriTriple(subject: string, predicate: string, object: string): Triple {
	return { subject, predicate, object, objectKind: "iri" };
}

function literalTriple(
	subject: string,
	predicate: string,
	value: string,
	datatype: string,
): Triple {
	return { subject, predicate, object: value, objectKind: "literal", datatype };
}

function integerTriple(subject: string, predicate: string, value: number): Triple {
	return literalTriple(subject, predicate, String(value), XSD_INTEGER);
}

/**
 * IRI of a property scoped to its owning entity or relation.
 *
 * OWL properties are global: two classes that each declare `id` share one
 * `owl:DatatypeProperty`, and stacking `rdfs:domain` on it makes the domain
 * the *intersection* of the two classes — an entailment the source model
 * never asserted. So the projection scopes the IRI to the owner instead,
 * which is what `OntologyProperty` actually means. The `.` delimiter is
 * deliberate: it keeps the result a legal Turtle `PN_LOCAL`, so
 * `muhanai:pythia-node.signalScore` is a valid CURIE rather than a bare
 * `<...>` IRI.
 */
function scopedIri(ownerIri: string, fieldName: string): string {
	return `${ownerIri}.${localName(fieldName)}`;
}

/** Turtle `PN_LOCAL`: must start and end with a member of `PN_CHARS`. */
const TURTLE_LOCAL = /^[A-Za-z_][A-Za-z0-9_.:-]*[A-Za-z0-9_:-]$|^[A-Za-z_]$/;

/** Local name that can be written as a CURIE, or `undefined`. */
function curieLocal(value: string, namespace: string): string | undefined {
	if (!value.startsWith(namespace)) return undefined;
	const local = value.slice(namespace.length);
	return TURTLE_LOCAL.test(local) ? local : undefined;
}

/** Longest matching prefix wins, so a nested namespace cannot shadow its parent. */
function shortenIri(value: string, context: Context): string {
	let bestPrefix = "";
	let bestLocal = "";
	let bestLength = -1;
	for (const [prefix, namespace] of Object.entries(context.prefixes)) {
		const local = curieLocal(value, namespace);
		if (local === undefined || namespace.length <= bestLength) continue;
		bestPrefix = prefix;
		bestLocal = local;
		bestLength = namespace.length;
	}
	return bestLength < 0 ? `<${value}>` : `${bestPrefix}:${bestLocal}`;
}

function quoteLiteral(value: string): string {
	return `"${escapeLiteral(value)}"`;
}

/**
 * `xsd:string` is the default datatype for a plain literal in RDF 1.1, so
 * emitting `^^xsd:string` would only add noise. Every other datatype is
 * spelled out, because a reader must not have to guess whether `"1"` is a
 * string or an integer.
 */
function datatypeSuffix(datatype: string | undefined, shorten?: (iri: string) => string): string {
	if (datatype === undefined || datatype === XSD_STRING) return "";
	return `^^${shorten ? shorten(datatype) : `<${datatype}>`}`;
}

/** Debug rendering of an IRI in loss entries: CURIE when possible. */
function shortenDebug(value: string, context: Context): string {
	return shortenIri(value, context);
}

/** Serialize one triple as N-Triples. */
function serializeTripleNTriples(triple: Triple): string {
	const object =
		triple.objectKind === "iri"
			? `<${triple.object}>`
			: `${quoteLiteral(triple.object)}${triple.datatype && triple.datatype !== XSD_STRING ? `^^<${triple.datatype}>` : ""}`;
	return `<${triple.subject}> <${triple.predicate}> ${object} .`;
}

/** Deterministic N-Triples: triples are already sorted by `compareTriples`. */
function serializeNTriples(triples: readonly Triple[]): string {
	return triples.map(serializeTripleNTriples).join("\n");
}

/** Deterministic Turtle: one prefix block, then sorted `subject predicate object .` lines. */
function serializeTurtle(triples: readonly Triple[], context: Context): string {
	const lines: string[] = [`# ${DERIVED_NOTICE}`];
	const prefixes = Object.entries(context.prefixes).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	);
	for (const [prefix, namespace] of prefixes) {
		lines.push(`@prefix ${prefix}: <${namespace}> .`);
	}
	lines.push("");
	const shorten = (iri: string): string => shortenIri(iri, context);
	for (const triple of triples) {
		const object =
			triple.objectKind === "iri"
				? shorten(triple.object)
				: `${quoteLiteral(triple.object)}${datatypeSuffix(triple.datatype, shorten)}`;
		lines.push(`${shorten(triple.subject)} ${shorten(triple.predicate)} ${object} .`);
	}
	return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Render an `OntologyModel` as derived RDF. Read the module header before
 * changing anything here: the direction is a contract, not a limitation.
 */
export function projectToRdf(model: OntologyModel, options: ProjectionOptions = {}): RdfProjection {
	const namespace = options.namespace ?? DEFAULT_NAMESPACE;
	const context: Context = {
		namespace,
		prefixes: defaultPrefixes(namespace, options.prefixes),
	};

	const triples: Triple[] = [];
	const losses: LossEntry[] = [];

	// Ontology header, stamped as derived so a hand-edit is detectable.
	const ontologyIri = namespace.replace(/[#/]$/, "");
	triples.push(iriTriple(ontologyIri, RDF_TYPE, OWL_ONTOLOGY));
	triples.push(literalTriple(ontologyIri, RDFS_COMMENT, DERIVED_NOTICE, XSD_STRING));
	if (options.sourceRevision !== undefined) {
		const revisionProp = `${namespace}${localName(REVISION_PROPERTY)}`;
		triples.push(iriTriple(revisionProp, RDF_TYPE, OWL_ANNOTATION_PROPERTY));
		triples.push(literalTriple(ontologyIri, revisionProp, options.sourceRevision, XSD_STRING));
	}

	for (let e = 0; e < model.entities.length; e++) {
		projectEntity(model.entities[e] as OntologyEntity, `entities[${e}]`, context, triples, losses);
	}
	for (let r = 0; r < model.relations.length; r++) {
		projectRelation(
			model.relations[r] as OntologyRelation,
			`relations[${r}]`,
			context,
			triples,
			losses,
		);
	}

	recordIriCollisions(model, context, losses);

	triples.sort(compareTriples);

	return {
		turtle: serializeTurtle(triples, context),
		ntriples: serializeNTriples(triples),
		losses,
		hasSemanticLoss: losses.some((loss) => loss.severity === "semantic"),
		tripleCount: triples.length,
	};
}

function projectEntity(
	entity: OntologyEntity,
	path: string,
	context: Context,
	triples: Triple[],
	losses: LossEntry[],
): void {
	const classIri = expandIri(entity.id, context);
	triples.push(iriTriple(classIri, RDF_TYPE, OWL_CLASS));
	triples.push(literalTriple(classIri, RDFS_LABEL, entity.label, XSD_STRING));

	// Closed-world checks live in SHACL, not OWL: the OWA means a missing
	// triple is never a violation, so `required` cannot be expressed in the
	// OWL part without changing its meaning.
	const shapeIri = `${classIri}Shape`;
	triples.push(iriTriple(shapeIri, RDF_TYPE, SH_NODE_SHAPE));
	triples.push(iriTriple(shapeIri, SH_TARGET_CLASS, classIri));

	const keys: string[] = [];
	entity.properties.forEach((prop, p) => {
		const propPath = `${path}.properties[${p}]`;
		const propIri = scopedIri(classIri, prop.name);
		triples.push(iriTriple(propIri, RDF_TYPE, OWL_DATATYPE_PROPERTY));
		triples.push(iriTriple(propIri, RDFS_DOMAIN, classIri));
		triples.push(iriTriple(propIri, RDFS_RANGE, XSD_TYPE[prop.type]));
		if (prop.description !== undefined) {
			triples.push(literalTriple(propIri, RDFS_COMMENT, prop.description, XSD_STRING));
		}

		const propShapeIri = `${shapeIri}.${localName(prop.name)}`;
		triples.push(iriTriple(shapeIri, SH_PROPERTY, propShapeIri));
		triples.push(iriTriple(propShapeIri, RDF_TYPE, SH_PROPERTY_SHAPE));
		triples.push(iriTriple(propShapeIri, SH_PATH, propIri));
		triples.push(iriTriple(propShapeIri, SH_DATATYPE, XSD_TYPE[prop.type]));

		// `string[]` becomes repeated triples: RDF has no array literal, and
		// inventing one (rdf:List, a JSON string) would change what the value
		// *means* more than repeating the triple does.
		if (prop.type === "string[]") {
			losses.push({
				path: `${propPath}.type`,
				construct: 'type: "string[]"',
				projection: `rdfs:range xsd:string, repeated assertions of ${shortenDebug(propIri, context)}`,
				gap: "Array ordering and duplicate-preservation are not carried by repeated triple assertions",
				severity: "structural",
			});
		} else {
			// Scalars are single-valued whether or not `required` is set.
			triples.push(integerTriple(propShapeIri, SH_MAX_COUNT, 1));
		}

		if (prop.required) {
			triples.push(integerTriple(propShapeIri, SH_MIN_COUNT, 1));
			losses.push({
				path: `${propPath}.required`,
				construct: "required: true",
				projection: `sh:minCount 1 on ${shortenDebug(propShapeIri, context)}`,
				gap: "OWL's Open World Assumption cannot assert key presence in a record; the constraint lives in the SHACL shape and holds only for SHACL-validating consumers",
				severity: "structural",
			});
		}

		if (prop.identity) {
			keys.push(propIri);
		}
	});

	if (keys.length > 0) {
		for (const key of keys) {
			triples.push(iriTriple(classIri, OWL_HAS_KEY, key));
		}
		losses.push({
			path: `${path}.properties[*].identity`,
			construct: `identity: true on ${keys.length} propert${keys.length === 1 ? "y" : "ies"}`,
			projection: `owl:hasKey on ${shortenDebug(classIri, context)}`,
			gap: "owl:hasKey states uniqueness for *interpreters* (any two individuals sharing the key values are the same individual); it does not require the key to be present, which is what a primary key means",
			severity: "semantic",
		});
	}
}

/**
 * Render a schema-level relation declaration as an `owl:ObjectProperty`
 * linking its source and target classes.
 *
 * `OntologyRelation.properties` describes attributes *of the edge itself*
 * (e.g. `strength`, `confidence`, `evidenceEventIds`). A bare triple cannot
 * carry edge attributes, so the projection attaches the attributes to the
 * property via a reification-style node: for each declared edge property
 * it emits the shared reified-statement vocabulary (`rdf:subject`,
 * `rdf:predicate`, `rdf:object` annotations on the property's shape) and a
 * SHACL property shape constraining that edge attribute.
 */
function projectRelation(
	relation: OntologyRelation,
	path: string,
	context: Context,
	triples: Triple[],
	losses: LossEntry[],
): void {
	const propIri = expandIri(relation.id, context);
	const sourceIri = expandIri(relation.source, context);
	const targetIri = expandIri(relation.target, context);

	// The predicate itself.
	triples.push(iriTriple(propIri, RDF_TYPE, OWL_OBJECT_PROPERTY));
	triples.push(iriTriple(propIri, RDFS_DOMAIN, sourceIri));
	triples.push(iriTriple(propIri, RDFS_RANGE, targetIri));
	// `label` is required by the type, but callers may hand us JSON that
	// omits it. Guard by type rather than trusting the declaration, so a
	// missing label degrades to "no rdfs:label" instead of a crash.
	if (typeof relation.label === "string" && relation.label.length > 0) {
		triples.push(literalTriple(propIri, RDFS_LABEL, relation.label, XSD_STRING));
	}

	// Closed-world checks for edge attributes live in SHACL, like entity properties.
	const edgeShapeIri = `${propIri}EdgeShape`;
	triples.push(iriTriple(edgeShapeIri, RDF_TYPE, SH_NODE_SHAPE));
	triples.push(iriTriple(edgeShapeIri, SH_TARGET_CLASS, sourceIri));

	const props = relation.properties ?? [];
	for (let p = 0; p < props.length; p++) {
		const edgeProp = props[p] as OntologyProperty;
		const edgePropPath = `${path}.properties[${p}]`;
		const edgePropIri = scopedIri(propIri, edgeProp.name);

		// The reification-style marker: the edge attribute is an annotation
		// of the statement the predicate asserts, not of either endpoint.
		triples.push(iriTriple(edgePropIri, RDF_TYPE, OWL_ANNOTATION_PROPERTY));
		triples.push(iriTriple(edgePropIri, RDFS_DOMAIN, propIri));
		triples.push(iriTriple(edgePropIri, RDFS_RANGE, XSD_TYPE[edgeProp.type]));
		if (edgeProp.description !== undefined) {
			triples.push(literalTriple(edgePropIri, RDFS_COMMENT, edgeProp.description, XSD_STRING));
		}

		const edgePropShapeIri = `${edgeShapeIri}.${localName(edgeProp.name)}`;
		triples.push(iriTriple(edgeShapeIri, SH_PROPERTY, edgePropShapeIri));
		triples.push(iriTriple(edgePropShapeIri, RDF_TYPE, SH_PROPERTY_SHAPE));
		triples.push(iriTriple(edgePropShapeIri, SH_PATH, edgePropIri));
		triples.push(iriTriple(edgePropShapeIri, SH_DATATYPE, XSD_TYPE[edgeProp.type]));

		if (edgeProp.type === "string[]") {
			losses.push({
				path: `${edgePropPath}.type`,
				construct: 'type: "string[]"',
				projection: `rdfs:range xsd:string, repeated assertions of ${shortenDebug(edgePropIri, context)}`,
				gap: "Array ordering and duplicate-preservation are not carried by repeated triple assertions",
				severity: "structural",
			});
		} else {
			triples.push(integerTriple(edgePropShapeIri, SH_MAX_COUNT, 1));
		}

		if (edgeProp.required) {
			triples.push(integerTriple(edgePropShapeIri, SH_MIN_COUNT, 1));
			losses.push({
				path: `${edgePropPath}.required`,
				construct: "required: true",
				projection: `sh:minCount 1 on ${shortenDebug(edgePropShapeIri, context)}`,
				gap: "OWL's Open World Assumption cannot assert key presence on an edge attribute; the constraint lives in the SHACL edge shape and holds only for SHACL-validating consumers",
				severity: "structural",
			});
		}

		if (edgeProp.identity) {
			losses.push({
				path: `${edgePropPath}.identity`,
				construct: `identity: true on edge attribute ${shortenDebug(edgePropIri, context)}`,
				projection: null,
				gap: "Edge attributes have no individual to key: owl:hasKey applies to the classes the predicate links, not to the predicate's own attributes, so the identity claim is dropped",
				severity: "semantic",
			});
		}
	}

	losses.push({
		path,
		construct: `relation with ${props.length} edge propert${props.length === 1 ? "y" : "ies"}`,
		projection: `owl:ObjectProperty ${shortenDebug(propIri, context)} with edge attributes reified as annotations on the predicate's edge shape`,
		gap: "A bare triple cannot carry data; consumers that read the OWL part alone see the link but not its attributes (strength, confidence, evidence). Edge attributes are recoverable only from the SHACL edge shape",
		severity: "structural",
	});
}

/**
 * Post-pass: detect identifiers that collapse onto a single IRI.
 *
 * `expandIri` sanitizes ids that are not absolute IRIs and not resolvable
 * CURIEs, replacing every character Turtle cannot carry in a local name with
 * `_`. That rewrite is not injective: `"a:b"` and `"a_b"` both become
 * `<namespace>a_b`. Two distinct concepts then project onto one resource,
 * and their `rdfs:label` assertions land on the same subject — so a consumer
 * sees two labels on one class and cannot tell whether the source model had
 * one entity or two.
 *
 * The projector cannot fix this (the collision happens before it sees the
 * second declaration), and it must not pick a winner. So it reports it:
 * a silent merge of distinct concepts is exactly the class of defect the
 * loss ledger exists to surface, and it needs a human to decide which id
 * to keep. Severity is `semantic` — no consumer reading both the OWL and the
 * SHACL halves can recover which source path each label came from.
 *
 * Runs after projection so it sees the final IRIs rather than re-deriving
 * them from a second code path that could drift from `expandIri`.
 */
function recordIriCollisions(model: OntologyModel, context: Context, losses: LossEntry[]): void {
	interface Declaration {
		iri: string;
		path: string;
		id: string;
		kind: "entity" | "relation";
	}

	const declarations: Declaration[] = [];

	for (let e = 0; e < model.entities.length; e++) {
		const entity = model.entities[e] as OntologyEntity;
		declarations.push({
			iri: expandIri(entity.id, context),
			path: `entities[${e}].id`,
			id: entity.id,
			kind: "entity",
		});
	}

	for (let r = 0; r < model.relations.length; r++) {
		const relation = model.relations[r] as OntologyRelation;
		declarations.push({
			iri: expandIri(relation.id, context),
			path: `relations[${r}].id`,
			id: relation.id,
			kind: "relation",
		});
	}

	const byIri = new Map<string, Declaration[]>();
	for (const declaration of declarations) {
		const bucket = byIri.get(declaration.iri);
		if (bucket) {
			bucket.push(declaration);
		} else {
			byIri.set(declaration.iri, [declaration]);
		}
	}

	for (const [iri, bucket] of byIri) {
		if (bucket.length < 2) continue;

		// Identical source ids repeating is a different defect from distinct
		// ids colliding: the former is a duplicate declaration, the latter is
		// a lossy rewrite. Both land on one IRI, so both are reported.
		const distinctIds = new Set(bucket.map((declaration) => declaration.id));
		const collapses = distinctIds.size > 1;

		losses.push({
			path: bucket.map((declaration) => declaration.path).join(", "),
			construct: bucket
				.map((declaration) => `${declaration.kind} id "${declaration.id}"`)
				.join(" + "),
			projection: collapses
				? `all declarations merged onto <${iri}>`
				: `duplicate declarations merged onto <${iri}>`,
			gap: collapses
				? "Distinct source identifiers expand to the same IRI because expandIri() sanitizes ids that are neither absolute IRIs nor resolvable CURIEs. Every label, domain, range and shape assertion for this resource is now attributed to the same subject, so the source graph's separate concepts cannot be recovered from the projection. Rename the ids so their Turtle local names differ"
				: "The same identifier is declared more than once. All assertions merge onto one resource and no consumer can tell which declaration was authoritative",
			severity: collapses ? "semantic" : "structural",
		});
	}
}

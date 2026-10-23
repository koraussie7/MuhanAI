# MuhanAI Ontology

This package vendors and adapts ontology modeling ideas from
[`openshuyi/ontograph-core`](https://github.com/openshuyi/ontograph-core).

The upstream project is MIT licensed. Its copyright and permission notice is
preserved in `LICENSE.ontograph-core`.

The vendored surface is intentionally limited to the TypeScript ontology
builder, Pythia domain definitions, validation, and JSON Schema export needed by
MuhanAI. It is not a drop-in copy of the upstream application.

## RDF is a derived artifact — never a source of truth

`src/projection.ts` projects the TypeScript `OntologyModel` into OWL/RDF, and
`src/serializers.ts` renders that projection as Turtle or N-Triples. The
direction is fixed and one-way:

1. **The event log is the only source of truth.** `cosmos-core` already states
   that aggregates are *projections* rebuilt from the log (`types.ts`). RDF is
   one more projection of that log, so it cannot become authoritative by
   construction.
2. **There is no reverse function.** This package exports projectors only.
   Nothing reads RDF back into `OntologyModel`. Do not add a `fromRdf` /
   `rdfToModel` — a round trip lets two truths drift apart. `projection.test.ts`
   asserts no such export exists.
3. **Nothing is lost silently.** Every construct that has no 1:1 RDF mapping
   produces a `LossEntry` with a `severity` of `structural` (survives, but under
   a different construct) or `semantic` (needs a human decision). Gate CI on
   `hasSemanticLoss`.
4. **The output is stamped as derived.** The Turtle carries a "do not edit by
   hand" notice plus an optional source revision, so a hand-patched artifact is
   detectable. Regenerate; never patch.

This matters because `ValueType` (`string | number | boolean | string[]`),
JSON Schema cardinality, and OWL open-world semantics have no lossless mapping
onto each other. The mismatch is dissolved by fixing the direction, not by
writing a better converter.

**Vocabulary ownership.** The Pythia term set lives in `src/pythia.ts` and is
the single source of truth. When an external ontology engine (e.g. `oo convert`
or `onto_diff`) proposes new terms, they are merged into `pythia.ts` and
re-projected — never hand-added to the generated Turtle.

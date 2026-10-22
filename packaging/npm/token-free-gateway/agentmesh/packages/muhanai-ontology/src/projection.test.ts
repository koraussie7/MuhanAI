import { describe, expect, it } from "vitest";
import type { OntologyModel } from "./model.js";
import { defineEntity, defineRelation, property } from "./model.js";
import { canonicalize, projectToRdf } from "./projection.js";
import { PythiaOntology } from "./pythia.js";
import { toNTriples, toTurtle } from "./serializers.js";

const base: OntologyModel = {
	entities: [
		defineEntity("Service", "A running service", [
			property("host", "string", { required: true }),
			property("port", "number"),
			property("tags", "string[]"),
		]),
	],
	relations: [
		defineRelation("depends_on", "dependency edge", "Service", "Service", [
			property("strength", "number", { required: true }),
			property("confidence", "number"),
		]),
	],
};

describe("projectToRdf", () => {
	it("projects an entity as an owl:Class with a label", () => {
		const p = projectToRdf(base);
		expect(p.turtle).toContain("Service");
		// The Turtle output compresses well-known namespaces to CURIEs, so
		// the type assertion is emitted as `rdf:type`, not the raw IRI. The
		// ntriples form is where the full IRI is observable.
		expect(p.turtle).toMatch(/rdf:type|rdf-syntax-ns#type/);
		expect(p.ntriples).toContain("http://www.w3.org/1999/02/22-rdf-syntax-ns#type");
		expect(p.turtle).toMatch(/muhanai:Service\s+rdfs:label\s+"A running service"/);
	});

	it("records a loss entry for the string[] property", () => {
		const p = projectToRdf(base);
		// `path` is an index path into the source model (the documented
		// contract in projection.ts), so the third property of the first
		// entity is `properties[2]` — `tags` in the fixture.
		const stringArrayLoss = p.losses.find((l) => l.path === "entities[0].properties[2].type");
		expect(stringArrayLoss).toBeDefined();
		expect(stringArrayLoss?.construct).toContain("string[]");
	});

	it("reifies the relation so edge attributes survive", () => {
		const p = projectToRdf(base);
		expect(p.turtle).toContain("depends_on");
		expect(p.turtle).toContain("strength");
	});

	it("keeps Turtle predicates CURIE-safe", () => {
		const p = projectToRdf(base);
		// Turtle output declares prefixes and uses CURIEs, so a predicate
		// should never appear as a bare `http://…` token there.
		for (const line of p.turtle.trim().split("\n")) {
			if (line.startsWith("@prefix") || line.startsWith("#") || line.trim() === "") continue;
			const predicate = line.trim().split(" ")[1];
			if (!predicate) continue;
			expect(predicate.startsWith("http")).toBe(false);
		}
	});

	it("emits absolute IRIs in the N-Triples body", () => {
		const p = projectToRdf(base);
		// N-Triples has no prefix mechanism, so IRIs must be absolute.
		expect(p.ntriples).toContain("<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>");
	});

	it("reports a triple count consistent with the N-Triples body", () => {
		const p = projectToRdf(base);
		expect(p.tripleCount).toBeGreaterThan(0);
		expect(p.ntriples.trim().split("\n").length).toBe(p.tripleCount);
	});

	it("never exports a reverse rdfToModel mapper", async () => {
		const mod = (await import("./projection.js")) as Record<string, unknown>;
		expect(mod.rdfToModel).toBeUndefined();
	});
});

describe("serializers", () => {
	it("canonicalize is stable across repeated calls", () => {
		const a = canonicalize(base);
		const b = canonicalize(base);
		expect(a).toEqual(b);
	});

	it("canonicalize is order-independent for the same entity set", () => {
		const reversed: OntologyModel = {
			entities: [...base.entities].reverse(),
			relations: [...base.relations].reverse(),
		};
		expect(canonicalize(reversed)).toEqual(canonicalize(base));
	});

	it("emits Turtle with @prefix and terminated statements", () => {
		const ttl = toTurtle(projectToRdf(base));
		expect(ttl).toContain("@prefix");
		expect(ttl.trimEnd().endsWith(".")).toBe(true);
	});

	it("emits one line per N-Triples statement", () => {
		const projection = projectToRdf(base);
		const nt = toNTriples(projection);
		const lines = nt.trim().split("\n");
		expect(lines.length).toBe(projection.tripleCount);
	});
});

describe("PythiaOntology projection", () => {
	it("projects the pythia ontology without throwing", () => {
		const p = projectToRdf(PythiaOntology);
		expect(p.tripleCount).toBeGreaterThan(0);
		expect(p.turtle).toContain("pythia");
	});

	it("exposes entities and relations on the model literal", () => {
		expect(PythiaOntology.entities.length).toBeGreaterThan(0);
		expect(PythiaOntology.relations.length).toBeGreaterThan(0);
	});
});

describe("identifier collisions", () => {
	it("records a semantic loss when distinct ids expand to the same IRI", () => {
		// "a:b" is not an absolute IRI and "a" is not a declared prefix, so
		// expandIri() falls back to sanitizing the local name — which turns it
		// into "a_b", colliding with the second entity's own id.
		const p = projectToRdf({
			entities: [
				{ id: "a:b", label: "A", properties: [] },
				{ id: "a_b", label: "B", properties: [] },
			],
			relations: [],
		});

		const collision = p.losses.find((loss) => loss.construct.includes('"a:b"'));
		expect(collision).toBeDefined();
		expect(collision?.severity).toBe("semantic");
		expect(p.hasSemanticLoss).toBe(true);
	});

	it("does not report a collision for ids that stay distinct", () => {
		const p = projectToRdf(base);
		const collisions = p.losses.filter((loss) => loss.construct.includes("+"));
		expect(collisions).toHaveLength(0);
	});

	it("reports a repeated identical id separately from a distinct-id collapse", () => {
		const p = projectToRdf({
			entities: [
				{ id: "Service", label: "A", properties: [] },
				{ id: "Service", label: "B", properties: [] },
			],
			relations: [],
		});

		const duplicate = p.losses.find(
			(loss) => loss.construct.includes('"Service"') && loss.projection !== null,
		);
		expect(duplicate).toBeDefined();
		expect(duplicate?.projection).toContain("duplicate declarations");
		expect(duplicate?.severity).toBe("structural");
		// Identical ids are recoverable by a consumer reading the projection,
		// so this must not trip the semantic-loss gate on its own.
		expect(p.hasSemanticLoss).toBe(false);
	});
});

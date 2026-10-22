import { describe, expect, it } from "vitest";
import { toJsonSchema, toMermaid } from "./exporters.js";
import { PythiaOntology } from "./pythia.js";
import { validateEntity } from "./validate.js";

describe("muhanai ontology", () => {
	it("declares the Pythia node and relation surface", () => {
		expect(PythiaOntology.entities.map((entity) => entity.id)).toEqual([
			"muhanai:pythia-node",
			"muhanai:pythia-prediction",
		]);
		expect(PythiaOntology.relations.map((relation) => relation.id)).toEqual([
			"muhanai:pythia-relation",
		]);
	});

	it("accepts a well-formed Pythia node", () => {
		const result = validateEntity(PythiaOntology, "muhanai:pythia-node", {
			id: "conflict::gulf-gps-jamming",
			label: "gulf gps jamming",
			domain: "conflict",
			nodeType: "concept",
			status: "amplified",
			signalScore: 94,
		});
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("reports each missing required property", () => {
		const result = validateEntity(PythiaOntology, "muhanai:pythia-node", {
			id: "conflict::gulf-gps-jamming",
		});
		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toEqual([
			"label",
			"domain",
			"nodeType",
			"status",
			"signalScore",
		]);
	});

	it("rejects a wrong property type", () => {
		const result = validateEntity(PythiaOntology, "muhanai:pythia-prediction", {
			id: "prediction::hormuz",
			title: "Hormuz closure risk",
			probability: "0.42",
			confidence: 0.5,
			referenceTime: "2026-09-25T00:00:00.000Z",
		});
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([{ path: "probability", message: "Expected number" }]);
	});

	it("rejects an unknown entity id instead of throwing", () => {
		const result = validateEntity(PythiaOntology, "muhanai:unknown", {});
		expect(result).toEqual({
			valid: false,
			issues: [{ path: "muhanai:unknown", message: "Unknown ontology entity" }],
		});
	});

	it("exports JSON Schema and Mermaid without losing entities", () => {
		const schema = toJsonSchema(PythiaOntology) as {
			oneOf: Array<{ title: string; required: string[] }>;
		};
		expect(schema.oneOf).toHaveLength(2);
		expect(schema.oneOf[0]?.required).toContain("signalScore");

		const mermaid = toMermaid(PythiaOntology);
		expect(mermaid).toContain("classDiagram");
		expect(mermaid).toContain("class muhanai_pythia_node {");
		expect(mermaid).toContain("class muhanai_pythia_prediction {");
		// Relations are drawn as edges between entities, not as classes.
		expect(mermaid).toContain("muhanai_pythia_node --> muhanai_pythia_node : Pythia relation");
	});
});

import { describe, expect, it } from "vitest";
import { toJsonSchema, toMermaid } from "./exporters.js";
import { PythiaNode, PythiaOntology } from "./pythia.js";
import { validateEntity } from "./validate.js";

describe("MuhanAI Pythia ontology", () => {
	it("validates a graph concept", () => {
		const result = validateEntity(PythiaOntology, PythiaNode.id, {
			id: "python::parse_csv",
			label: "parse_csv",
			domain: "python",
			nodeType: "concept",
			status: "validated",
			signalScore: 0.8,
			sourceEventIds: ["evt-1"],
		});
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("rejects missing required properties", () => {
		const result = validateEntity(PythiaOntology, PythiaNode.id, { label: "missing id" });
		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toContain("id");
	});

	it("exports documentation artifacts", () => {
		const schema = toJsonSchema(PythiaOntology);
		const mermaid = toMermaid(PythiaOntology);
		expect(schema.$schema).toContain("2020-12");
		expect(mermaid).toContain("classDiagram");
		expect(mermaid).toContain("pythia_node");
	});
});

import type { OntologyModel } from "./model.js";

function jsonType(type: string): string {
	if (type === "string[]") return "array";
	return type;
}

export function toJsonSchema(model: OntologyModel): Record<string, unknown> {
	const schemas = model.entities.map((entity) => {
		const properties: Record<string, Record<string, unknown>> = {};
		for (const field of entity.properties) {
			const schema: Record<string, unknown> = { type: jsonType(field.type) };
			if (field.type === "string[]") schema.items = { type: "string" };
			properties[field.name] = schema;
		}
		return {
			title: entity.label,
			type: "object",
			properties,
			required: entity.properties.filter((field) => field.required).map((field) => field.name),
		};
	});
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$title: "MuhanAI Ontology",
		oneOf: schemas,
	};
}

export function toMermaid(model: OntologyModel): string {
	const lines = ["classDiagram"];
	for (const entity of model.entities) {
		lines.push(`class ${entity.id.replace(/[^A-Za-z0-9_]/g, "_")} {`);
		for (const field of entity.properties) lines.push(`  ${field.type} ${field.name}`);
		lines.push("}");
	}
	for (const relation of model.relations) {
		lines.push(
			`${relation.source.replace(/[^A-Za-z0-9_]/g, "_")} --> ${relation.target.replace(/[^A-Za-z0-9_]/g, "_")} : ${relation.label}`,
		);
	}
	return lines.join("\n");
}

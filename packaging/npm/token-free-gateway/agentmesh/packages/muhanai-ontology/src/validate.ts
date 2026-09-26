import type { OntologyEntity, OntologyModel } from "./model.js";

export interface ValidationIssue {
	path: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}

function isValueType(value: unknown, type: string): boolean {
	if (type === "string") return typeof value === "string";
	if (type === "number") return typeof value === "number" && Number.isFinite(value);
	if (type === "boolean") return typeof value === "boolean";
	if (type === "string[]")
		return Array.isArray(value) && value.every((item) => typeof item === "string");
	return false;
}

export function validateEntity(
	model: OntologyModel,
	entityId: string,
	value: Record<string, unknown>,
): ValidationResult {
	const entity = model.entities.find((candidate) => candidate.id === entityId);
	if (!entity)
		return { valid: false, issues: [{ path: entityId, message: "Unknown ontology entity" }] };
	return validateAgainstEntity(entity, value);
}

export function validateAgainstEntity(
	entity: OntologyEntity,
	value: Record<string, unknown>,
): ValidationResult {
	const issues: ValidationIssue[] = [];
	for (const field of entity.properties) {
		const actual = value[field.name];
		if (actual === undefined || actual === null) {
			if (field.required)
				issues.push({ path: field.name, message: "Required property is missing" });
			continue;
		}
		if (!isValueType(actual, field.type)) {
			issues.push({ path: field.name, message: `Expected ${field.type}` });
		}
	}
	return { valid: issues.length === 0, issues };
}

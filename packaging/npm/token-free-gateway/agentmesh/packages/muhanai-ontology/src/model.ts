export type ValueType = "string" | "number" | "boolean" | "string[]";

export interface OntologyProperty {
	name: string;
	type: ValueType;
	required?: boolean;
	identity?: boolean;
	description?: string;
}

export interface OntologyEntity {
	id: string;
	label: string;
	properties: readonly OntologyProperty[];
}

export interface OntologyRelation {
	id: string;
	source: string;
	target: string;
	label: string;
	properties?: readonly OntologyProperty[];
}

export interface OntologyModel {
	entities: readonly OntologyEntity[];
	relations: readonly OntologyRelation[];
}

export function defineEntity(
	id: string,
	label: string,
	properties: readonly OntologyProperty[],
): OntologyEntity {
	return { id, label, properties };
}

export function defineRelation(
	id: string,
	label: string,
	source: string,
	target: string,
	properties: readonly OntologyProperty[] = [],
): OntologyRelation {
	return { id, label, source, target, properties };
}

export function property(
	name: string,
	type: ValueType,
	options: Omit<OntologyProperty, "name" | "type"> = {},
): OntologyProperty {
	return { name, type, ...options };
}

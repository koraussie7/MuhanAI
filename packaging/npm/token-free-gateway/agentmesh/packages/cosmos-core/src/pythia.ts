import {
	PythiaNode,
	PythiaOntology,
	type ValidationResult,
	validateAgainstEntity,
} from "@muhanai/ontology";

export interface PythiaOntologyConcept {
	id: string;
	label: string;
	domain: string;
	nodeType?: string;
	status: string;
	signalScore: number;
	sourceEventIds?: string[];
}

/** Validate a projected Cosmos concept before exposing it to Pythia clients. */
export function validatePythiaConcept(concept: PythiaOntologyConcept): ValidationResult {
	return validateAgainstEntity(PythiaNode, {
		id: concept.id,
		label: concept.label,
		domain: concept.domain,
		nodeType: concept.nodeType ?? "concept",
		status: concept.status,
		signalScore: concept.signalScore,
		sourceEventIds: concept.sourceEventIds ?? [],
	});
}

export { PythiaOntology };

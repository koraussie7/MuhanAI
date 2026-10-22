import { defineEntity, defineRelation, type OntologyModel, property } from "./model.js";

export const PythiaNode = defineEntity("muhanai:pythia-node", "Pythia Node", [
	property("id", "string", { required: true, identity: true }),
	property("label", "string", { required: true }),
	property("domain", "string", { required: true }),
	property("nodeType", "string", { required: true }),
	property("status", "string", { required: true }),
	property("signalScore", "number", { required: true }),
	property("sourceEventIds", "string[]"),
]);

export const PythiaPrediction = defineEntity("muhanai:pythia-prediction", "Pythia Prediction", [
	property("id", "string", { required: true, identity: true }),
	property("title", "string", { required: true }),
	property("probability", "number", { required: true }),
	property("confidence", "number", { required: true }),
	property("referenceTime", "string", { required: true }),
	property("derivedFrom", "string[]"),
]);

export const PythiaRelation = defineRelation(
	"muhanai:pythia-relation",
	"Pythia relation",
	"muhanai:pythia-node",
	"muhanai:pythia-node",
	[
		property("predicate", "string", { required: true }),
		property("strength", "number", { required: true }),
		property("confidence", "number"),
		property("evidenceEventIds", "string[]"),
	],
);

export const PythiaOntology: OntologyModel = {
	entities: [PythiaNode, PythiaPrediction],
	relations: [PythiaRelation],
};

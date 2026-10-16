/**
 * OntologyGraph — Cytoscape.js 기반 온톨로지 지식 그래프
 */

import React, { useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";

export interface OntologyNode {
	id: string;
	label: string;
	type: "domain" | "concept" | "event" | "agent";
	color: string;
}

export interface OntologyEdge {
	id: string;
	source: string;
	target: string;
	label: string;
}

interface OntologyGraphProps {
	nodes: OntologyNode[];
	edges: OntologyEdge[];
	height?: number;
	onNodeClick?: (node: OntologyNode) => void;
}

export const OntologyGraph: React.FC<OntologyGraphProps> = ({
nodes,
edges,
height = 500,
onNodeClick,
}) => {
	const cyRef = useRef<HTMLDivElement>(null);
	const [cy, setCy] = useState<any>(null);

	const nodeTypeStyles: Record<string, Record<string, string>> = {
		domain: { "background-color": "#38bdf8", width: "90", height: "90" },
		concept: { "background-color": "#f59e0b", width: "70", height: "70" },
		event: { "background-color": "#ef4444", width: "60", height: "60" },
		agent: { "background-color": "#10b981", width: "80", height: "80" },
	};

	useEffect(() => {
		const container = cyRef.current;
		if (!container) return;

		const cyInstance = cytoscape({
container,
elements: [
...nodes.map((n) => ({
data: { id: n.id, label: n.label },
classes: n.type,
})),
				...edges.map((e) => ({
data: { id: e.id, source: e.source, target: e.target, label: e.label },
})),
			],
			style: [
				{
					selector: "node",
					style: {
						label: "data(label)",
						"text-valign": "center",
						"text-halign": "center",
						color: "#fff",
						"font-size": 11,
						"text-outline-width": 2,
						"text-outline-color": "#000",
					} as any,
				},
				{
					selector: "edge",
					style: {
						label: "data(label)",
						width: 2,
						"line-color": "#94a3b8",
						"target-arrow-color": "#94a3b8",
						"target-arrow-shape": "triangle",
						"font-size": 9,
						"curve-style": "bezier",
					} as any,
				},
				...Object.entries(nodeTypeStyles).map(([type, styles]) => ({
selector: `.${type}`,
style: {
...styles,
shape: (type === "agent" ? "rectangle" : "ellipse") as any,
} as any,
})),
				{
					selector: "node:selected",
					style: {
						"border-width": 3,
						"border-color": "#38bdf8",
					} as any,
				},
			] as any,
			layout: {
				name: "cose",
				idealEdgeLength: 120,
				nodeRepulsion: 4500,
				edgeElasticity: 0.4,
				numberOfIterations: 2500,
				animate: true,
				animationDuration: 1000,
			} as any,
		});

		// 노드 클릭 이벤트
		cyInstance.on("tap", "node", (evt: any) => {
			const node = evt.target;
			const nodeData = node.data() as OntologyNode;
			const found = nodes.find((n) => n.id === nodeData.id);
			if (found && onNodeClick) {
				onNodeClick(found);
			}
		});

		setCy(cyInstance);

		return () => {
			cyInstance.destroy();
			setCy(null);
		};
	}, [nodes, edges, onNodeClick]);

	// 노드/엣지 업데이트 시 cytoscape 요소 갱신
	useEffect(() => {
		if (!cy) return;
		cy.elements().remove();
		cy.add([
...nodes.map((n) => ({
data: { id: n.id, label: n.label },
classes: n.type,
})),
			...edges.map((e) => ({
data: { id: e.id, source: e.source, target: e.target, label: e.label },
})),
		]);
		cy.layout({ name: "cose", animate: true }).run();
	}, [cy, nodes, edges]);

	return (
<div
			ref={cyRef}
			className="w-full h-full bg-[#0a0a12] rounded-lg border border-white/5"
			style={{ minHeight: height, height }}
		/>
	);
};

export default OntologyGraph;

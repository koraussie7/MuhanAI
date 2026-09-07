export interface KnowledgeComponent {
	id: string;
	type: string;
	content: string;
	ownerId: string;
	shared: boolean;
	timestamp: number;
}

export interface WheelQueryResult {
	exists: boolean;
	component?: KnowledgeComponent;
	action: "reuse" | "create";
}

export class WheelProtocol {
	private shared = new Map<string, KnowledgeComponent>();

	register(component: KnowledgeComponent): void {
		this.shared.set(component.id, component);
	}

	query(type: string, _requirement: string): WheelQueryResult {
		const match = [...this.shared.values()].find((c) => c.type === type && c.shared);
		if (match) {
			return { exists: true, component: match, action: "reuse" };
		}
		return { exists: false, action: "create" };
	}

	markShared(id: string): void {
		const component = this.shared.get(id);
		if (component) {
			component.shared = true;
			this.shared.set(id, component);
		}
	}

	listShared(): KnowledgeComponent[] {
		return [...this.shared.values()].filter((c) => c.shared);
	}
}

export const wheelProtocol = new WheelProtocol();

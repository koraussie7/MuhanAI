type EventCallback = (...args: any[]) => void;

export class EventEmitter {
	private listeners = new Map<string, Set<EventCallback>>();

	on(event: string, callback: EventCallback): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
		return () => this.off(event, callback);
	}

	off(event: string, callback: EventCallback): void {
		this.listeners.get(event)?.delete(callback);
	}

	emit(event: string, ...args: any[]): void {
		this.listeners.get(event)?.forEach((cb) => cb(...args));
	}

	removeAllListeners(): void {
		this.listeners.clear();
	}
}

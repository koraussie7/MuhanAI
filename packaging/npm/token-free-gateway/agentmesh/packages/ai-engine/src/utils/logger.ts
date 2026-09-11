export class Logger {
	private prefix: string;

	constructor(prefix: string = "AIEngine") {
		this.prefix = prefix;
	}

	info(...args: any[]): void {
		console.log(`[${this.prefix}]`, ...args);
	}

	warn(...args: any[]): void {
		console.warn(`[${this.prefix}]`, ...args);
	}

	error(...args: any[]): void {
		console.error(`[${this.prefix}]`, ...args);
	}

	debug(...args: any[]): void {
		if (process.env.NODE_ENV === "development") {
			console.debug(`[${this.prefix}]`, ...args);
		}
	}
}

export const logger = new Logger();

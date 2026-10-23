import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
	label: string;
	children: ReactNode;
}

interface State {
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(`[${this.props.label}] render failed`, error, info.componentStack);
	}

	override render() {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<div data-testid="page-error-boundary" style={{ padding: 40, textAlign: "center" }}>
				<h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
					{this.props.label} 페이지를 표시할 수 없습니다
				</h2>
				<p style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
					{error.message}
				</p>
				<button type="button" onClick={() => this.setState({ error: null })}>
					다시 시도
				</button>
			</div>
		);
	}
}
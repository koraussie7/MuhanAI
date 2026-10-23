import type { ReactNode } from "react";

interface Props {
	id: string;
	eyebrow?: string;
	title?: string;
	children: ReactNode;
}

export function Section({ id, eyebrow, title, children }: Props) {
	return (
		<section id={id} className="section">
			{eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
			{title && <h2 className="section-title">{title}</h2>}
			{children}
		</section>
	);
}
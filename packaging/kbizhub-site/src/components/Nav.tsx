import { useState } from "react";

const LINKS = [
	{ href: "#starter", label: "29,000원 스타터" },
	{ href: "#why", label: "왜 KBizHub인가" },
	{ href: "#mybiz", label: "My AI Business" },
	{ href: "#team-builder", label: "AI 팀" },
	{ href: "#marketplace", label: "마켓플레이스" },
	{ href: "#human-expert", label: "인간 전문가" },
	{ href: "#economy", label: "Agent Economy" },
	{ href: "#message-center", label: "메시지 센터" },
	{ href: "#template-studio", label: "템플릿 스튜디오" },
] as const;

export function Nav() {
	const [open, setOpen] = useState(false);

	return (
		<nav className="navbar">
			<div className="logo">
				<span>KBizHub</span>
				<span className="logo-badge">AI BUSINESS</span>
			</div>
			<ul id="navLinks" className={`nav-links ${open ? "open" : ""}`}>
				{LINKS.map((l) => (
					<li key={l.href}>
						<a href={l.href} onClick={() => setOpen(false)}>
							{l.label}
						</a>
					</li>
				))}
			</ul>
			<div className="nav-actions">
				<a href="https://muhanai.com" target="_blank" className="btn-secondary">
					MuhanAI
				</a>
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="btn-primary"
					style={{ fontWeight: 800 }}
				>
					29,000원으로 시작하기
				</button>
				<button
					className="hamburger"
					aria-label="메뉴 열기"
					aria-expanded={open}
					aria-controls="navLinks"
					onClick={() => setOpen((v) => !v)}
				>
					<span></span>
					<span></span>
					<span></span>
				</button>
			</div>
		</nav>
	);
}
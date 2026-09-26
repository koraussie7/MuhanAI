import { PageBox } from "./PageBox.js";

/** Contributions page rendered inside <PageBox>. */
export default function ContributionsPage() {
	return (
		<PageBox iconKey="activity" title="Contributions" subtitle="내 기여 내역 및 리워드">
			<p style={{ color: "var(--cline-text-muted)" }}>기여 내역 페이지가 곧 제공됩니다.</p>
		</PageBox>
	);
}

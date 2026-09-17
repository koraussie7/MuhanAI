import { PageBox } from "./PageBox.js";

/** Reputation page rendered inside <PageBox>. */
export default function ReputationPage() {
	return (
		<PageBox iconKey="star" title="Reputation" subtitle="신뢰 점수 및 평판 시스템">
			<p style={{ color: "var(--cline-text-muted)" }}>평판 시스템 페이지가 곧 제공됩니다.</p>
		</PageBox>
	);
}

import { PageBox } from "./PageBox.js";

/** Search page rendered inside <PageBox>. */
export default function SearchPage() {
  return (
    <PageBox
      iconKey="search"
      title="Mesh Search"
      subtitle="P2P 지식 그래프 검색"
    >
      <p style={{ color: "var(--cline-text-muted)" }}>
        검색 페이지가 곧 제공됩니다.
      </p>
    </PageBox>
  );
}

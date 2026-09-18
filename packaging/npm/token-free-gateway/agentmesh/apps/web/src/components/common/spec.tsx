import type { ReactNode } from "react";

export function SpecPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <h2>{title}</h2>
        {subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function StatGrid({ stats }: { stats: [string, string | number][] }) {
  return (
    <div className="stat-grid">
      {stats.map(([label, value]) => (
        <div className="stat-card" key={label}>
          <strong>
            {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
          </strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="spec-progress">
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

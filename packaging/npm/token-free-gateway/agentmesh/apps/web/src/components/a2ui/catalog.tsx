/**
 * A2UI ops catalog — React 19 implementations.
 *
 * Each component reads only what the wire is allowed to carry (label, intent,
 * bound values). No colors, icons, or sizes arrive over the wire: `intent`
 * implies the appearance, and CSS owns the mapping.
 */
import type { CSSProperties, ReactNode } from "react";
import type { A2UIComponent, DataTableColumn, DynamicValue } from "./wire.js";
import { resolveValue } from "./wire.js";

export type Intent = "good" | "bad" | "warning" | "info" | "neutral";

/** Normalizes whatever arrived into a known intent. */
export function normalizeIntent(value: unknown): Intent {
  return value === "good" || value === "bad" || value === "warning" || value === "info"
    ? value
    : "neutral";
}

/**
 * The ONLY place intent becomes color. Kept as CSS variables so a host theme
 * (like store1.kbizhub.com) can restyle intents without touching the wire.
 */
export function intentStyle(intent: Intent): CSSProperties {
  return {
    "--a2ui-intent": `var(--a2ui-${intent}, currentColor)`,
  } as CSSProperties;
}

export function IntentBadge({ label, intent }: { label: string; intent: Intent }) {
  return (
    <span className="a2ui-badge" style={intentStyle(intent)} data-intent={intent}>
      {label}
    </span>
  );
}

export function Callout({ title, text, intent }: { title?: string; text: string; intent: Intent }) {
  return (
    <div className="a2ui-callout" style={intentStyle(intent)} data-intent={intent}>
      {title && <strong>{title}</strong>}
      <p>{text}</p>
    </div>
  );
}

export function KeyValue({
  label,
  items,
}: {
  label?: string;
  items: Array<{ key: string; value: DynamicValue }>;
}) {
  return (
    <div className="a2ui-keyvalue">
      {label && <h4>{label}</h4>}
      <dl>
        {items.map((item) => (
          <div key={item.key}>
            <dt>{item.key}</dt>
            <dd>{String(resolveValue(item.value, undefined) ?? "")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Formats a cell value. The wire carries raw numbers; the renderer applies the
 * user's locale and the declared currency.
 */
export function formatCell(value: unknown, column: DataTableColumn): string {
  if (value === null || value === undefined) return "";
  if (column.format === "currency" && typeof value === "number") {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: column.currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (column.format === "number" && typeof value === "number") {
    return new Intl.NumberFormat(undefined).format(value);
  }
  return String(value);
}

export function DataTable({
  label,
  items,
  columns,
}: {
  label?: string;
  items: Array<Record<string, unknown>>;
  columns: DataTableColumn[];
}) {
  if (!items.length) {
    return (
      <div className="a2ui-table-empty" data-state="empty">
        {label ? `${label}: 표시할 항목이 없습니다.` : "표시할 항목이 없습니다."}
      </div>
    );
  }

  return (
    <div className="a2ui-table">
      {label && <h4>{label}</h4>}
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row, rowIndex) => (
            <tr key={typeof row.name === "string" ? row.name : rowIndex}>
              {columns.map((c) => {
                // `intent` is resolved per row, so a dish going sold out changes
                // colour without new markup.
                //
                // The binding is authored table-level (`/menu/statusIntent`), but
                // `row` is already one `/menu/N` item — so only its final segment
                // applies here. Reading the full path would always miss and leave
                // every cell neutral.
                const cellIntent = c.intent
                  ? normalizeIntent(resolveValue(c.intent, row, true))
                  : "neutral";
                return (
                  <td key={c.key} data-intent={cellIntent}>
                    {cellIntent !== "neutral" ? (
                      <IntentBadge label={formatCell(row[c.key], c)} intent={cellIntent} />
                    ) : (
                      formatCell(row[c.key], c)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({
  label,
  value,
  intent,
  unit,
}: {
  label: string;
  value: number | string;
  intent: Intent;
  unit?: string;
}) {
  const display =
    typeof value === "number" ? new Intl.NumberFormat(undefined).format(value) : value;
  return (
    <div className="a2ui-stat" style={intentStyle(intent)} data-intent={intent}>
      <strong>
        {display}
        {unit ? <small>{unit}</small> : null}
      </strong>
      <span>{label}</span>
    </div>
  );
}

export function Text({ text }: { text: DynamicValue }) {
  return <p className="a2ui-text">{String(text ?? "")}</p>;
}

/** Layout primitives — registered under the A2UI basic catalog. */
export function Column({ children }: { children: ReactNode }) {
  return <div className="a2ui-column">{children}</div>;
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="a2ui-row">{children}</div>;
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="a2ui-card">{children}</section>;
}

/**
 * A consequential action gets a confirm step. The wire declares the action
 * name; the host decides how to dispatch it (here: an onAction callback).
 */
export function ConfirmButton({
  label,
  confirmLabel,
  intent,
  action,
  onAction,
}: {
  label: string;
  confirmLabel?: string;
  intent: Intent;
  action: { name: string };
  onAction?: (name: string) => void;
}) {
  const handleClick = () => {
    if (confirmLabel && typeof window !== "undefined" && !window.confirm(confirmLabel)) {
      return;
    }
    onAction?.(action.name);
  };

  return (
    <button
      type="button"
      className="a2ui-confirm"
      style={intentStyle(intent)}
      data-intent={intent}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}

/** The ops-catalog registry consumed by `<A2UISurface>`. */
export const catalog: Record<string, (props: Record<string, unknown>) => ReactNode> = {
  Text: ({ text }) => <Text text={text as DynamicValue} />,
  Column: ({ children }) => <Column>{children as ReactNode}</Column>,
  Row: ({ children }) => <Row>{children as ReactNode}</Row>,
  Card: ({ children }) => <Card>{children as ReactNode}</Card>,
  Badge: ({ label, intent }) => (
    <IntentBadge label={String(label)} intent={normalizeIntent(intent)} />
  ),
  // `exactOptionalPropertyTypes` forbids passing an explicit `undefined` for an
  // optional prop, so optional values are spread in only when present.
  Callout: ({ title, text, intent }) => (
    <Callout
      {...(title === undefined ? {} : { title: String(title) })}
      text={String(text)}
      intent={normalizeIntent(intent)}
    />
  ),
  KeyValue: ({ label, items }) => (
    <KeyValue
      {...(label === undefined ? {} : { label: String(label) })}
      items={items as Array<{ key: string; value: DynamicValue }>}
    />
  ),
  DataTable: ({ label, items, columns }) => (
    <DataTable
      {...(label === undefined ? {} : { label: String(label) })}
      items={items as Array<Record<string, unknown>>}
      columns={columns as DataTableColumn[]}
    />
  ),
  Stat: ({ label, value, intent, unit }) => (
    <Stat
      label={String(label)}
      value={value as number | string}
      intent={normalizeIntent(intent)}
      {...(unit === undefined ? {} : { unit: String(unit) })}
    />
  ),
  ConfirmButton: ({ label, confirmLabel, intent, action, onAction }) => (
    <ConfirmButton
      label={String(label)}
      {...(confirmLabel === undefined ? {} : { confirmLabel: String(confirmLabel) })}
      intent={normalizeIntent(intent)}
      action={action as { name: string }}
      {...(onAction === undefined ? {} : { onAction: onAction as (name: string) => void })}
    />
  ),
};

export type { A2UIComponent };

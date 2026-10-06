import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-display text-4xl sm:text-5xl">{title}</h1>
          {subtitle && (
            <span className="text-sm font-medium tracking-wide text-muted">{subtitle}</span>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          className={`segmented-item ${value === opt.id ? "segmented-item-active" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="section-label">{children}</h2>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

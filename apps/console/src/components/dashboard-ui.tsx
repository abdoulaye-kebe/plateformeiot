"use client";

import Link from "next/link";

/** Carte dashboard style Live Objects */
export function DashboardCard({
  title,
  children,
  footer,
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={`card-live flex flex-col ${className}`}>
      <div className="border-b border-gray-300 px-6 py-3">
        {tabs && tabs.length > 0 ? (
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange?.(tab.id)}
                className={activeTab === tab.id ? "card-tab-active card-tab -mb-px" : "card-tab -mb-px"}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="text-[15px] font-semibold text-black">{title}</h2>
        )}
      </div>
      <div className="flex-1 px-6 py-5">{children}</div>
      {footer && <div className="border-t border-gray-200 px-6 py-3">{footer}</div>}
    </section>
  );
}

/** Grand chiffre KPI — style Live Objects */
export function MetricLarge({
  value,
  label,
  highlight = false,
  size = "lg",
}: {
  value: string | number;
  label: string;
  highlight?: boolean;
  size?: "lg" | "md";
}) {
  return (
    <div>
      <p className={`font-bold tabular-nums leading-none ${highlight ? "text-brand" : "text-black"} ${size === "lg" ? "text-[2.75rem]" : "text-2xl"}`}>
        {value}
      </p>
      <p className="mt-2 text-sm text-gray-600">{label}</p>
    </div>
  );
}

/** Légende avec pastille colorée */
export function LegendItem({ color, label, value }: { color: string; label: string; value?: string | number }) {
  return (
    <li className="flex items-center gap-2.5 py-1 text-sm text-gray-800">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <span>
        {value != null && <span className="mr-1.5 tabular-nums font-semibold">{value}</span>}
        {label}
      </span>
    </li>
  );
}

/** Mini graphique barres orange */
export function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-3 flex h-10 items-end gap-px">
      {values.map((v, i) => (
        <div key={i} className="flex-1 bg-brand transition-all" style={{ height: `${Math.max(8, (v / max) * 100)}%`, opacity: v > 0 ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

export function DashboardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-normal text-brand hover:underline">
      {children}
    </Link>
  );
}

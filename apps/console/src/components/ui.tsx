"use client";

import { useClientAuth } from "@/lib/useClientAuth";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-2 text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatCard({ label, value, hint, tone = "text-white" }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </article>
  );
}

export function RoleBanner() {
  const { viewerOnly } = useClientAuth();
  if (!viewerOnly) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
      Mode <strong>lecture seule</strong> (viewer). Connectez-vous avec <strong>operator/operator</strong> ou <strong>admin/admin</strong> pour créer ou modifier.
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const online = status === "ONLINE" || status === "active";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-400"}`}>
      {status || "—"}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">{message}</p>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

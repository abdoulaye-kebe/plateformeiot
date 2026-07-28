"use client";

import { useClientAuth } from "@/lib/useClientAuth";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-gray-300 bg-white px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-xl font-bold text-black">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = true,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article className="card-live p-5">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-black">{value}</p>
      <div className={`mt-3 h-1 w-12 ${accent ? "bg-brand" : "bg-gray-300"}`} aria-hidden />
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </article>
  );
}

export function RoleBanner() {
  const { viewerOnly } = useClientAuth();
  if (!viewerOnly) return null;
  return (
    <div className="mb-6 border-l-4 border-brand bg-white p-4 text-sm text-gray-800 shadow-card">
      Mode <strong>lecture seule</strong> (viewer). Connectez-vous avec <strong>operator/operator</strong> ou{" "}
      <strong>admin/admin</strong> pour créer ou modifier.
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const online = status === "ONLINE" || status === "active";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${online ? "bg-brand-light text-brand-dark" : "bg-gray-100 text-gray-600"}`}>
      {status || "—"}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">{message}</p>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card-live p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="border border-brand bg-brand-light px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-dark">
      Plan {plan}
    </span>
  );
}

export function BtnPrimary({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn-primary ${className}`} {...props}>
      {children}
    </button>
  );
}

export function BtnAccent({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`btn-accent ${className}`} {...props}>
      {children}
    </button>
  );
}

export function LinkAccent({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} className={`text-sm font-semibold text-brand hover:text-brand-dark hover:underline ${className}`}>
      {children}
    </a>
  );
}

export function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-gray-700">
      <span className="font-bold text-brand">✓</span>
      {children}
    </li>
  );
}

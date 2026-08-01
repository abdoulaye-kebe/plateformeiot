"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DATA_NAV = [
  { href: "/data/messages", label: "Data Messages" },
  { href: "/data/analytics", label: "Analytics" },
  { href: "/data/decoders", label: "Decoders" },
  { href: "/apps/shengda/water-meters", label: "Compteurs eau" },
  { href: "/integrations", label: "Routing & connectors" },
  { href: "/rules", label: "Custom pipelines" },
];

export default function DataShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-gray-200 bg-white lg:w-56 lg:border-b-0 lg:border-r">
        <div className="p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Data</p>
          <nav className="space-y-0.5">
            {DATA_NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-3 py-2 text-sm ${
                    active ? "bg-brand-light font-medium text-brand-dark" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function CopyIcon({ value }: { value: string }) {
  return (
    <button
      type="button"
      title="Copier"
      className="ml-1 inline-flex text-gray-400 hover:text-brand"
      onClick={() => navigator.clipboard.writeText(value)}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </button>
  );
}

export function DeviceStatusDot({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-500",
    sleeping: "bg-amber-400",
    offline: "bg-gray-300",
  };
  const labels: Record<string, string> = {
    online: "Online",
    sleeping: "Sleeping",
    offline: "Offline",
  };
  const s = status ?? "offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${colors[s] ?? colors.offline}`} />
      {labels[s] ?? s}
    </span>
  );
}

export { CopyIcon };

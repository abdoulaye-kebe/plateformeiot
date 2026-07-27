"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession, sessionUser } from "@/lib/auth";
import { hasFeature, parseFeatures } from "@/lib/features";
import TenantScopeSelector from "@/components/TenantScopeSelector";

type NavItem = { href: string; label: string; roles: string[]; section?: string; feature?: string };

const NAV: NavItem[] = [
  { href: "/", label: "Tableau de bord", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Principal" },
  { href: "/agent", label: "Agent IA", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Principal", feature: "agent" },
  { href: "/applications", label: "Applications", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Réseau" },
  { href: "/devices", label: "Devices", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Réseau" },
  { href: "/gateways", label: "Gateways", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Réseau" },
  { href: "/fuota", label: "FUOTA", roles: ["platform-admin", "tenant-admin", "operator"], section: "Réseau", feature: "fuota" },
  { href: "/analytics", label: "Analytics", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Données" },
  { href: "/anomalies", label: "Anomalies", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Données", feature: "anomalies" },
  { href: "/rules", label: "Règles & routage", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Données" },
  { href: "/noc", label: "NOC", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Données" },
  { href: "/billing", label: "Facturation", roles: ["platform-admin", "tenant-admin"], section: "Données" },
  { href: "/settings", label: "Paramètres", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], section: "Compte" },
  { href: "/admin/tenants", label: "Tenants clients", roles: ["platform-admin"], section: "Administration" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const session = mounted ? getSession() : null;
  const user = sessionUser(session);

  useEffect(() => {
    setMounted(true);
    if (!getSession()) router.replace("/login");
    else apiFetch<{ features?: unknown }>("/api/v1/tenants/me").then((t) => setFeatures(parseFeatures(t?.features)));
  }, [router]);

  if (!mounted) return <div className="min-h-screen bg-slate-950" />;

  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("platform-admin");
  const visibleNav = NAV.filter((n) => {
    if (!isAdmin && !n.roles.some((r) => roles.includes(r))) return false;
    if (isAdmin) return true;
    if (n.feature && !hasFeature(features, n.feature)) return false;
    return true;
  });

  const sections = visibleNav.reduce<Record<string, NavItem[]>>((acc, item) => {
    const s = item.section ?? "Autre";
    acc[s] = acc[s] ?? [];
    acc[s].push(item);
    return acc;
  }, {});

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/90">
        <div className="border-b border-slate-800 p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Lorawan SaaS</p>
          <p className="mt-1 font-semibold">{isAdmin ? "Administration plateforme" : "Portail client"}</p>
        </div>
        <TenantScopeSelector />
        <nav className="flex-1 overflow-y-auto p-3">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section} className="mb-4">
              <p className="mb-1 px-3 text-[10px] uppercase tracking-widest text-slate-500">{section}</p>
              {items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mb-0.5 block rounded-lg px-3 py-2 text-sm ${
                      active ? "bg-emerald-500/15 text-emerald-300" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-4 text-xs text-slate-400">
          <p className="truncate font-medium text-slate-300">{user?.email || "—"}</p>
          <p className="mt-1 capitalize text-slate-500">{roles[0]?.replace("-", " ") || "viewer"}</p>
          <button type="button" onClick={() => { clearSession(); router.replace("/login"); }} className="mt-3 text-emerald-400 hover:underline">
            Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-950">{children}</main>
    </div>
  );
}

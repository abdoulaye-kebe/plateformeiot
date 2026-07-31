"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { clearSession, getSession, sessionUser } from "@/lib/auth";
import { hasFeature, parseFeatures } from "@/lib/features";
import BrandLogo from "@/components/BrandLogo";
import DashboardSubTabs from "@/components/DashboardSubTabs";
import TopBar from "@/components/TopBar";
import TenantScopeSelector from "@/components/TenantScopeSelector";

type NavItem = {
  href: string;
  label: string;
  roles: string[];
  feature?: string;
  match?: (path: string) => boolean;
};

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], match: (p) => p === "/" },
  {
    href: "/devices",
    label: "Devices",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/devices"),
  },
  {
    href: "/gateways",
    label: "Gateways",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/gateways"),
  },
  {
    href: "/applications",
    label: "Applications",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/applications"),
  },
  {
    href: "/apps",
    label: "Apps métier",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/apps"),
  },
  {
    href: "/data/messages",
    label: "Data",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/data") || p.startsWith("/analytics") || p.startsWith("/rules"),
  },
  {
    href: "/noc",
    label: "Alarms & reports",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/noc") || p.startsWith("/anomalies"),
  },
  {
    href: "/agent",
    label: "Agent IA",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    feature: "agent",
    match: (p) => p.startsWith("/agent"),
  },
  {
    href: "/getting-started",
    label: "Premiers pas",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) => p.startsWith("/getting-started"),
  },
  {
    href: "/settings",
    label: "Administration",
    roles: ["platform-admin", "tenant-admin", "operator", "viewer"],
    match: (p) =>
      p.startsWith("/settings") ||
      p.startsWith("/integrations") ||
      p.startsWith("/billing") ||
      p.startsWith("/admin") ||
      p.startsWith("/fuota"),
  },
];

const EXTRA_NAV: NavItem[] = [
  { href: "/rules", label: "Rules", roles: ["platform-admin", "tenant-admin", "operator", "viewer"] },
  { href: "/anomalies", label: "Anomalies", roles: ["platform-admin", "tenant-admin", "operator", "viewer"], feature: "anomalies" },
  { href: "/fuota", label: "FUOTA", roles: ["platform-admin", "tenant-admin", "operator"], feature: "fuota" },
  { href: "/billing", label: "Billing", roles: ["platform-admin", "tenant-admin"] },
  { href: "/admin/tenants", label: "Tenants", roles: ["platform-admin"] },
];

function navActive(item: NavItem, pathname: string) {
  if (item.match) return item.match(pathname);
  return item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const session = mounted ? getSession() : null;
  const user = sessionUser(session);

  useEffect(() => {
    setMounted(true);
    if (!getSession()) router.replace("/login");
    else apiFetch<{ features?: unknown }>("/api/v1/tenants/me").then((t) => setFeatures(parseFeatures(t?.features)));
  }, [router, pathname]);

  if (!mounted) return <div className="min-h-screen bg-[#f4f4f4]" />;

  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("platform-admin");

  function visible(item: NavItem) {
    if (!isAdmin && !item.roles.some((r) => roles.includes(r))) return false;
    if (item.feature && !isAdmin && !hasFeature(features, item.feature)) return false;
    return true;
  }

  const mainNav = MAIN_NAV.filter(visible);
  const extraNav = EXTRA_NAV.filter(visible);
  const showSubTabs = pathname === "/" || pathname.startsWith("/dashboards");

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userEmail={user?.email} />

      <header className="bg-black">
        <div className="flex items-stretch gap-6 px-4 lg:px-6">
          <div className="flex shrink-0 items-center py-3">
            <BrandLogo variant="dark" compact />
          </div>

          <nav className="flex flex-1 items-stretch gap-5 overflow-x-auto">
            {mainNav.map((item) => {
              const active = navActive(item, pathname);
              return (
                <Link key={item.href} href={item.href} className={`nav-top-link ${active ? "nav-top-active" : ""}`}>
                  {item.label}
                </Link>
              );
            })}
            {extraNav.length > 0 && (
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="nav-top-link"
                >
                  More ▾
                </button>
                {menuOpen && (
                  <div className="absolute left-0 top-full z-50 min-w-[180px] border border-gray-300 bg-white py-1 shadow-lg">
                    {extraNav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-800 hover:bg-gray-100"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-4 py-3 text-sm text-white/90">
            <Link href="/settings" className="hidden hover:text-white sm:inline">
              Help center ?
            </Link>
            <TenantScopeSelector variant="header" />
            <span className="hidden max-w-[140px] truncate md:inline">{user?.email?.split("@")[0] || "—"}</span>
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
              className="text-white/70 hover:text-white"
              title="Déconnexion"
            >
              ⎋
            </button>
          </div>
        </div>
      </header>

      {showSubTabs && <DashboardSubTabs />}

      <main className="flex-1 bg-[#f4f4f4]">{children}</main>
    </div>
  );
}

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

function NavLink({
  item,
  pathname,
  variant,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const active = navActive(item, pathname);
  if (variant === "desktop") {
    return (
      <Link href={item.href} className={`nav-top-link ${active ? "nav-top-active" : ""}`}>
        {item.label}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`nav-mobile-link ${active ? "nav-mobile-active" : ""}`}
    >
      {item.label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = mounted ? getSession() : null;
  const user = sessionUser(session);

  useEffect(() => {
    setMounted(true);
    if (!getSession()) router.replace("/login");
    else apiFetch<{ features?: unknown }>("/api/v1/tenants/me").then((t) => setFeatures(parseFeatures(t?.features)));
  }, [router, pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

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
  const closeMobileNav = () => setMobileNavOpen(false);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userEmail={user?.email} />

      <header className="relative z-40 bg-black">
        <div className="flex items-center justify-between gap-2 px-3 py-2 lg:gap-6 lg:px-6 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-white hover:bg-white/10 lg:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileNavOpen ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="sr-only">{mobileNavOpen ? "Fermer" : "Menu"}</span>
              {mobileNavOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <div className="flex shrink-0 items-center py-1 lg:py-3">
              <BrandLogo variant="dark" compact />
            </div>
          </div>

          <nav className="hidden flex-1 items-stretch gap-5 lg:flex" aria-label="Navigation principale">
            {mainNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} variant="desktop" />
            ))}
            {extraNav.length > 0 && (
              <div className="relative flex items-center">
                <button type="button" onClick={() => setMoreOpen((o) => !o)} className="nav-top-link">
                  More ▾
                </button>
                {moreOpen && (
                  <div className="absolute left-0 top-full z-50 min-w-[180px] border border-gray-300 bg-white py-1 shadow-lg">
                    {extraNav.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
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

          <div className="hidden shrink-0 items-center gap-4 py-3 text-sm text-white/90 lg:flex">
            <Link href="/settings" className="hidden hover:text-white xl:inline">
              Help center ?
            </Link>
            <TenantScopeSelector variant="header" />
            <span className="hidden max-w-[140px] truncate xl:inline">{user?.email?.split("@")[0] || "—"}</span>
            <button type="button" onClick={logout} className="text-white/70 hover:text-white" title="Déconnexion">
              ⎋
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button type="button" onClick={logout} className="inline-flex h-10 w-10 items-center justify-center text-white/80 hover:text-white" title="Déconnexion">
              ⎋
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              aria-label="Fermer le menu"
              onClick={closeMobileNav}
            />
            <nav
              id="mobile-nav-panel"
              className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto border-t border-white/10 bg-black pb-8 shadow-2xl lg:hidden"
              aria-label="Navigation mobile"
            >
              {user?.email && (
                <div className="border-b border-white/10 px-4 py-3 text-sm text-white/70">
                  Connecté · {user.email.split("@")[0]}
                </div>
              )}
              <div className="border-b border-white/10 px-4 py-3 lg:hidden">
                <TenantScopeSelector variant="header" />
              </div>
              {mainNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} variant="mobile" onNavigate={closeMobileNav} />
              ))}
              {extraNav.length > 0 && (
                <div className="border-t border-white/10 pt-2">
                  <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/40">More</p>
                  {extraNav.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} variant="mobile" onNavigate={closeMobileNav} />
                  ))}
                </div>
              )}
              <Link href="/settings" onClick={closeMobileNav} className="nav-mobile-link border-t border-white/10">
                Help center · Paramètres
              </Link>
            </nav>
          </>
        )}
      </header>

      {showSubTabs && <DashboardSubTabs />}

      <main className="min-w-0 flex-1 bg-[#f4f4f4]">{children}</main>
    </div>
  );
}

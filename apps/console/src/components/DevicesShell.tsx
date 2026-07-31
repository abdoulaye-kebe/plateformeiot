"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DEVICE_NAV = [
  { href: "/devices", label: "All devices" },
  { href: "/applications", label: "Applications" },
  { href: "/fuota", label: "Firmware OTA (FUOTA)" },
  { href: "/water-meters", label: "Compteurs eau" },
];

export default function DevicesShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-gray-200 bg-white lg:w-56 lg:border-b-0 lg:border-r">
        <div className="p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Devices</p>
          <nav className="space-y-0.5">
            {DEVICE_NAV.map((item) => {
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

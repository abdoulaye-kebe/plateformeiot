"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DashboardTab = { id: string; name: string };

export default function DashboardSubTabs() {
  const pathname = usePathname();
  const [dashboards, setDashboards] = useState<DashboardTab[]>([]);

  useEffect(() => {
    apiFetch<{ result: DashboardTab[] }>("/api/v1/dashboards").then((data) => {
      setDashboards(data?.result ?? []);
    });
  }, [pathname]);

  const onMain = pathname === "/";
  const onNew = pathname === "/dashboards/new";
  const activeCustomId = pathname.startsWith("/dashboards/") && !onNew ? pathname.split("/")[2] : null;

  return (
    <div className="dashboard-sub-bar">
      <div className="flex items-end gap-0 overflow-x-auto">
        <span className="mr-4 hidden shrink-0 self-center pb-3.5 text-[11px] font-bold uppercase tracking-widest text-gray-400 sm:inline">
          Dashboards
        </span>

        <Link href="/" className={onMain ? "sub-tab-active" : "sub-tab"}>
          Main dashboard
        </Link>

        {dashboards.map((d) => (
          <Link
            key={d.id}
            href={`/dashboards/${d.id}`}
            className={`${activeCustomId === d.id ? "sub-tab-active" : "sub-tab"} max-w-[220px]`}
            title={d.name}
          >
            <span className="truncate">{d.name}</span>
          </Link>
        ))}

        <Link href="/dashboards/new" className={onNew ? "sub-tab-add sub-tab-add-active" : "sub-tab-add"}>
          + Add a custom dashboard
        </Link>
      </div>
    </div>
  );
}

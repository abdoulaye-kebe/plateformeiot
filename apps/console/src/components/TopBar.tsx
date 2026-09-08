"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

type TopBarProps = {
  userEmail?: string;
};

/** Barre utilitaire — style Live Objects */
export default function TopBar(_props: TopBarProps) {
  const [now, setNow] = useState("");

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    setNow(fmt());
    const id = setInterval(fmt, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center justify-between bg-black px-3 py-1.5 text-[11px] text-white/80 sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 truncate">
        <span className="shrink-0">Sonatel · Orange IoT</span>
        <span className="hidden text-white/35 sm:inline">|</span>
        <span className="hidden truncate font-medium text-white/90 sm:inline">Orange IoT Platform</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-2">
        <span className="text-white/60">Local time {now || "—"}</span>
      </div>
    </div>
  );
}

export function HeaderBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between bg-black px-6 py-4">
      <BrandLogo variant="dark" subtitle="Sonatel" />
      {children}
    </header>
  );
}

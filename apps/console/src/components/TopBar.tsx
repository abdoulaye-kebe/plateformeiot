"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

type TopBarProps = {
  userEmail?: string;
};

/** Barre utilitaire — style Live Objects */
export default function TopBar({ userEmail }: TopBarProps) {
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
    <div className="flex items-center justify-between bg-black px-3 py-1.5 text-[11px] text-white/80 sm:px-4">
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
        <span className="truncate">Sonatel · Orange IoT</span>
        <span className="hidden text-white/40 sm:inline">|</span>
        <span className="hidden truncate sm:inline">M2M portal</span>
        <span className="hidden text-white/40 md:inline">|</span>
        <span className="hidden truncate md:inline">LoRaWAN Platform</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-2">
        <span className="hidden text-white/60 sm:inline">Local time {now || "—"}</span>
        {userEmail && (
          <span className="hidden max-w-[120px] truncate text-white/70 sm:inline">{userEmail.split("@")[0]}</span>
        )}
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

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
    <div className="flex items-center justify-between bg-black px-4 py-1.5 text-[11px] text-white/80">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>Sonatel · Orange IoT</span>
        <span className="hidden text-white/40 sm:inline">|</span>
        <span className="hidden sm:inline">M2M portal</span>
        <span className="hidden text-white/40 md:inline">|</span>
        <span className="hidden md:inline">LoRaWAN Platform</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden text-white/60 sm:inline">Local time {now || "—"}</span>
        {userEmail && <span className="max-w-[120px] truncate text-white/70">{userEmail.split("@")[0]}</span>}
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

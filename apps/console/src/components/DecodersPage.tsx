"use client";

import DataShell from "@/components/DataShell";
import DecodersManager from "@/components/DecodersManager";
import { PageHeader, RoleBanner } from "@/components/ui";
import Link from "next/link";

export default function DecodersPage() {
  return (
    <DataShell>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Decoders"
          subtitle="Gérez vos codecs JavaScript ChirpStack — décodage uplink et encodage downlink"
        />
        <RoleBanner />
        <nav className="mb-4 text-xs text-gray-500">
          <Link href="/data/messages" className="hover:text-brand">
            Data
          </Link>
          <span className="mx-1">›</span>
          <span className="text-gray-800">Decoders</span>
        </nav>
        <DecodersManager />
        <p className="mt-4 text-xs text-gray-500">
          Compteurs d&apos;eau Shengda : voir aussi{" "}
          <Link href="/water-meters" className="text-brand hover:underline">
            Eau / Vannes
          </Link>
        </p>
      </div>
    </DataShell>
  );
}

"use client";

import Link from "next/link";
import BusinessAppsShell from "@/components/BusinessAppsShell";
import { PageHeader, RoleBanner } from "@/components/ui";

const BUSINESS_APPS = [
  {
    id: "shengda-water",
    name: "Shengda — Eau / Vannes",
    description: "Télérelevé compteurs d'eau, index m³, batterie et commandes vanne (protocole V1.6).",
    href: "/apps/shengda/water-meters",
    vendor: "Shengda",
  },
];

export default function BusinessAppsPage() {
  return (
    <BusinessAppsShell>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Applications métier"
          subtitle="Modules spécifiques fournisseurs — distincts de la console LoRaWAN générique"
        />
        <RoleBanner />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {BUSINESS_APPS.map((app) => (
            <Link
              key={app.id}
              href={app.href}
              className="card-live block p-5 transition hover:border-brand hover:shadow-md"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{app.vendor}</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{app.name}</h2>
              <p className="mt-2 text-sm text-gray-600">{app.description}</p>
              <span className="mt-4 inline-block text-sm font-medium text-brand">Ouvrir →</span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-gray-500">
          La plateforme LoRaWAN (devices, gateways, data, decoders) reste accessible via le menu principal.
        </p>
      </div>
    </BusinessAppsShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PageHeader, RoleBanner } from "@/components/ui";
import TenantOnboardingWizard from "@/components/TenantOnboardingWizard";

export default function GettingStartedPage() {
  const [tenantName, setTenantName] = useState<string>();

  useEffect(() => {
    apiFetch<{ name?: string }>("/api/v1/tenants/me").then((t) => setTenantName(t?.name));
  }, []);

  return (
    <div className="mx-auto max-w-[900px] p-4 lg:p-6">
      <PageHeader title="Premiers pas" subtitle="Configurez votre réseau LoRaWAN en quelques minutes" />
      <RoleBanner />
      <TenantOnboardingWizard tenantName={tenantName} />
    </div>
  );
}

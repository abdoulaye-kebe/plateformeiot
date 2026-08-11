"use client";

import BusinessAppsShell from "@/components/BusinessAppsShell";
import WaterMetersPage from "@/components/WaterMetersPage";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Page() {
  return (
    <ErrorBoundary label="Compteurs d'eau Shengda">
      <BusinessAppsShell>
        <WaterMetersPage />
      </BusinessAppsShell>
    </ErrorBoundary>
  );
}

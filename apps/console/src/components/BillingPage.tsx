"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiMutate, isPlatformAdmin } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, StatCard } from "@/components/ui";
import { parseFeatures } from "@/lib/features";

const FEATURE_LABELS: Record<string, string> = {
  analytics: "Analytics & tableaux de bord",
  rules: "Moteur de règles",
  noc: "NOC temps réel",
  fuota: "FUOTA (mises à jour OTA)",
  anomalies: "Détection d'anomalies ML",
  agent: "Agent IA LoRaWAN",
  api_keys: "Clés API dédiées",
  priority_support: "Support prioritaire",
};

function featureLabel(id: string) {
  return FEATURE_LABELS[id] ?? id;
}

type Billing = { period: string; uplinkCount: number; activeDevices: number; activeGateways: number; estimatedEur: string };
type Daily = { day: string; uplinkCount: number; deviceCount: number; gatewayCount: number };
type Plan = { id: string; name: string; maxDevices: number; maxGateways: number; maxUplinksMonth: number; priceEurMonthly?: number; priceEurYearly?: number; features: string[] };
type Subscription = {
  tenant: { plan: string; planDetails?: Plan; subscriptionStatus?: string; billingInterval?: string };
  usage: {
    uplinkCount: number;
    deviceCount: number;
    gatewayCount: number;
    uplinksRemaining: number;
    devicesRemaining: number;
    gatewaysRemaining: number;
    withinLimits: boolean;
    plan: Plan;
  };
};

function pct(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

export default function BillingPage() {
  const { user, isAdmin } = useClientAuth();
  const [usage, setUsage] = useState<Billing | null>(null);
  const [history, setHistory] = useState<Daily[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [stripeMsg, setStripeMsg] = useState("");

  useEffect(() => {
    apiFetch<Billing>("/api/v1/billing/usage").then(setUsage);
    apiFetch<{ result: Daily[] }>("/api/v1/billing/history?days=30").then((d) => setHistory(d?.result ?? []));
    apiFetch<Subscription>("/api/v1/billing/subscription").then((s) => {
      setSub(s);
      if (s?.tenant?.billingInterval === "year" || s?.tenant?.billingInterval === "month") {
        setBillingInterval(s.tenant.billingInterval);
      }
    });
    apiFetch<{ result: Plan[] }>("/api/v1/plans").then((d) =>
      setPlans(
        (d?.result ?? []).map((p) => ({
          ...p,
          features: parseFeatures(p.features),
        })),
      ),
    );
  }, []);

  useEffect(() => {
    if (selectedPlanId || plans.length === 0) return;
    const current = sub?.tenant?.plan;
    setSelectedPlanId(current && plans.some((p) => p.id === current) ? current : plans[0].id);
  }, [plans, sub?.tenant?.plan, selectedPlanId]);

  async function runAggregate() {
    setMsg("");
    const { data, error } = await apiMutate<{ aggregatedTenants: number }>("/api/v1/billing/aggregate", "POST");
    if (error) setMsg(error);
    else setMsg(`Agrégation OK — ${data?.aggregatedTenants ?? 0} tenant(s) traités`);
  }

  async function upgradePlan(planId: string) {
    setStripeMsg("");
    const { data, error } = await apiMutate<{ url?: string }>("/api/v1/billing/stripe/checkout", "POST", {
      planId,
      billingInterval,
    });
    if (error) setStripeMsg(error);
    else if (data?.url) window.location.href = data.url;
    else setStripeMsg("Stripe non configuré (STRIPE_SECRET_KEY)");
  }

  function planPrice(p: Plan) {
    if (billingInterval === "year") {
      return p.priceEurYearly != null ? `${p.priceEurYearly.toLocaleString("fr-FR")} €/an` : "Sur devis";
    }
    return p.priceEurMonthly != null ? `${p.priceEurMonthly} €/mois` : "Sur devis";
  }

  function yearlySavings(p: Plan) {
    if (p.priceEurMonthly == null || p.priceEurYearly == null) return null;
    const monthlyTotal = p.priceEurMonthly * 12;
    const saved = monthlyTotal - p.priceEurYearly;
    if (saved <= 0) return null;
    return Math.round((saved / monthlyTotal) * 100);
  }

  const q = sub?.usage;
  const currentPlan = sub?.tenant?.planDetails ?? q?.plan;
  const currentPlanId = sub?.tenant?.plan;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;
  const isCurrentSelected = selectedPlanId === currentPlanId;

  return (
    <div className="p-4 lg:p-6">
      <PageHeader title="Facturation & abonnement" subtitle="Plan, quotas et historique d'usage LoRaWAN" />

      {currentPlan && q && (
        <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Plan actuel" value={currentPlan.name} />
          <StatCard label="Devices" value={`${q.deviceCount} / ${currentPlan.maxDevices}`} />
          <StatCard label="Gateways" value={`${q.gatewayCount} / ${currentPlan.maxGateways}`} />
          <StatCard label="Uplinks (mois)" value={`${q.uplinkCount.toLocaleString("fr-FR")} / ${currentPlan.maxUplinksMonth.toLocaleString("fr-FR")}`} />
        </section>
      )}

      {q && currentPlan && (
        <Section title="Quotas du mois">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Devices", used: q.deviceCount, max: currentPlan.maxDevices },
              { label: "Gateways", used: q.gatewayCount, max: currentPlan.maxGateways },
              { label: "Uplinks", used: q.uplinkCount, max: currentPlan.maxUplinksMonth },
            ].map((bar) => (
              <div key={bar.label}>
                <div className="mb-1 flex justify-between text-xs text-gray-600">
                  <span>{bar.label}</span>
                  <span>{pct(Number(bar.used), Number(bar.max))}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className={`h-2 rounded-full ${pct(Number(bar.used), Number(bar.max)) > 90 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${pct(Number(bar.used), Number(bar.max))}%` }} />
                </div>
              </div>
            ))}
          </div>
          {!q.withinLimits && <p className="mt-3 text-sm text-brand-dark">Quota dépassé — passez à un plan supérieur pour continuer à ajouter des devices ou gateways.</p>}
        </Section>
      )}

      <Section title="Changer de plan">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">Facturation :</span>
          <div className="inline-flex rounded-lg border border-gray-300 p-1">
            <button
              type="button"
              onClick={() => setBillingInterval("month")}
              className={`rounded-md px-3 py-1.5 text-sm ${billingInterval === "month" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-800"}`}
            >
              Mensuel
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("year")}
              className={`rounded-md px-3 py-1.5 text-sm ${billingInterval === "year" ? "bg-brand text-white" : "text-gray-600 hover:text-gray-800"}`}
            >
              Annuel
            </button>
          </div>
          {sub?.tenant?.billingInterval && (
            <span className="text-xs text-gray-500">
              Abonnement actuel : {sub.tenant.billingInterval === "year" ? "annuel" : "mensuel"}
            </span>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = currentPlanId === p.id;
            const isSelected = selectedPlanId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? "border-brand bg-brand-light ring-1 ring-brand"
                    : isCurrent
                      ? "border-brand bg-brand-light hover:border-brand-dark"
                      : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-brand">{p.name}</p>
                  {isCurrent && <span className="rounded bg-brand-light px-2 py-0.5 text-[10px] text-brand-dark">Actuel</span>}
                </div>
                <p className="mt-1 text-2xl font-bold">{planPrice(p)}</p>
                {billingInterval === "year" && yearlySavings(p) != null && (
                  <p className="mt-1 text-xs text-brand">Économisez {yearlySavings(p)}% vs mensuel</p>
                )}
                <ul className="mt-3 space-y-1 text-xs text-gray-600">
                  <li>{p.maxDevices.toLocaleString("fr-FR")} devices</li>
                  <li>{p.maxGateways.toLocaleString("fr-FR")} gateways</li>
                  <li>{p.maxUplinksMonth.toLocaleString("fr-FR")} uplinks/mois</li>
                </ul>
                <p className="mt-3 text-xs text-brand">{isSelected ? "Offre sélectionnée" : "Cliquer pour voir le détail"}</p>
              </button>
            );
          })}
        </div>

        {selectedPlan && (
          <div className="mt-6 rounded-xl border border-gray-300 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Offre {selectedPlan.name}
                  {isCurrentSelected && <span className="ml-2 text-sm font-normal text-brand">(votre plan actuel)</span>}
                </h3>
                <p className="mt-1 text-3xl font-bold text-brand">{planPrice(selectedPlan)}</p>
                {billingInterval === "year" && selectedPlan.priceEurMonthly != null && selectedPlan.priceEurYearly != null && (
                  <p className="mt-1 text-sm text-gray-600">
                    soit {(selectedPlan.priceEurYearly / 12).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €/mois facturés annuellement
                  </p>
                )}
                {billingInterval === "month" && selectedPlan.priceEurYearly != null && (
                  <p className="mt-1 text-sm text-gray-500">
                    ou {selectedPlan.priceEurYearly.toLocaleString("fr-FR")} €/an
                    {yearlySavings(selectedPlan) != null && ` (−${yearlySavings(selectedPlan)}%)`}
                  </p>
                )}
              </div>
              {!isCurrentSelected && (
                <button
                  type="button"
                  onClick={() => upgradePlan(selectedPlan.id)}
                  className="btn-accent"
                >
                  Choisir {selectedPlan.name}
                </button>
              )}
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Quotas inclus</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex justify-between border-b border-gray-200 pb-2">
                    <span>Devices LoRaWAN</span>
                    <span className="font-medium text-gray-800">{selectedPlan.maxDevices.toLocaleString("fr-FR")}</span>
                  </li>
                  <li className="flex justify-between border-b border-gray-200 pb-2">
                    <span>Gateways</span>
                    <span className="font-medium text-gray-800">{selectedPlan.maxGateways.toLocaleString("fr-FR")}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Uplinks / mois</span>
                    <span className="font-medium text-gray-800">{selectedPlan.maxUplinksMonth.toLocaleString("fr-FR")}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Fonctionnalités incluses</p>
                {selectedPlan.features.length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune fonctionnalité listée.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedPlan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-brand">✓</span>
                        {featureLabel(f)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {plans.length > 1 && (
              <div className="mt-6 overflow-x-auto">
                <p className="mb-2 text-sm font-medium text-gray-700">Comparatif rapide</p>
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-gray-500">
                      <th className="pb-2 pr-4">Plan</th>
                      <th className="pb-2 pr-4">Prix</th>
                      <th className="pb-2 pr-4">Devices</th>
                      <th className="pb-2">Features</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr
                        key={p.id}
                        className={`border-b border-gray-200/60 ${p.id === selectedPlanId ? "bg-brand-light" : ""}`}
                      >
                        <td className="py-2 pr-4">
                          <button type="button" onClick={() => setSelectedPlanId(p.id)} className="text-left hover:text-brand">
                            {p.name}
                            {currentPlanId === p.id && <span className="ml-1 text-xs text-brand">●</span>}
                          </button>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{planPrice(p)}</td>
                        <td className="py-2 pr-4 tabular-nums">{p.maxDevices.toLocaleString("fr-FR")}</td>
                        <td className="py-2 text-gray-600">{p.features.length} incl.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {stripeMsg && <p className="mt-2 text-sm text-brand-dark">{stripeMsg}</p>}
      </Section>

      <section className="mb-8 mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Période" value={usage?.period ?? "—"} />
        <StatCard label="Estimation €" value={usage ? `${usage.estimatedEur} €` : "—"} />
      </section>

      {isPlatformAdmin(user?.roles ?? []) && (
        <Section title="Administration">
          <button type="button" onClick={runAggregate} className="btn-accent">
            Agréger billing (hier)
          </button>
          {msg && <p className="mt-2 text-sm text-brand">{msg}</p>}
        </Section>
      )}

      <Section title="Historique 30 jours">
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune donnée — lancez l&apos;agrégation ou attendez du trafic MQTT.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-600">
                <th className="pb-2">Jour</th><th>Uplinks</th><th>Devices</th><th>Gateways</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.day} className="border-b border-gray-200/50">
                  <td className="py-2">{row.day}</td>
                  <td>{row.uplinkCount}</td>
                  <td>{row.deviceCount}</td>
                  <td>{row.gatewayCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

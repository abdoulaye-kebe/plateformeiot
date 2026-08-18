"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";

type OnboardingStatus = {
  hasApplication: boolean;
  hasDeviceProfile: boolean;
  hasGateway: boolean;
  hasDevice: boolean;
  hasTraffic: boolean;
  currentStep: number;
  complete: boolean;
  chirpstackTenantId?: string;
};

type AppRow = { id?: string; application?: { id?: string; name?: string } };
type ProfileRow = { id?: string; deviceProfile?: { id?: string; name?: string } };

const STEPS = [
  { id: 1, title: "Application & profil", desc: "Organisez vos capteurs et définissez le profil radio EU868." },
  { id: 2, title: "Gateway", desc: "Enregistrez votre passerelle LoRaWAN pour recevoir les uplinks." },
  { id: 3, title: "Device", desc: "Ajoutez votre premier capteur ou actuateur." },
  { id: 4, title: "Connexion radio", desc: "Configurez le device physique et vérifiez les premiers uplinks." },
  { id: 5, title: "Agent IA", desc: "Automatisez la suite avec l'assistant intelligent." },
];

export default function TenantOnboardingWizard({
  tenantName,
  onRefresh,
}: {
  tenantName?: string;
  onRefresh?: () => void;
}) {
  const { write } = useClientAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [openStep, setOpenStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apps, setApps] = useState<AppRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  const [gwForm, setGwForm] = useState({ gatewayId: "", name: "", description: "" });
  const [devForm, setDevForm] = useState({ devEui: "", name: "", applicationId: "", deviceProfileId: "", joinEui: "" });

  const load = useCallback(async () => {
    const [st, a, p] = await Promise.all([
      apiFetch<OnboardingStatus>("/api/v1/onboarding/status"),
      apiFetch<{ result: AppRow[] }>("/api/v1/lorawan/applications?limit=20"),
      apiFetch<{ result: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=20"),
    ]);
    if (st) {
      setStatus(st);
      if (!st.complete) setOpenStep(st.currentStep);
    }
    setApps(a?.result ?? []);
    setProfiles(p?.result ?? []);
    const appId = a?.result?.[0]?.application?.id ?? a?.result?.[0]?.id ?? "";
    const profId = p?.result?.[0]?.deviceProfile?.id ?? p?.result?.[0]?.id ?? "";
    setDevForm((f) => ({ ...f, applicationId: f.applicationId || appId, deviceProfileId: f.deviceProfileId || profId }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!status || status.complete) return null;

  async function bootstrap() {
    setBusy(true);
    setError("");
    const { error: err } = await apiMutate("/api/v1/onboarding/bootstrap", "POST", {
      applicationName: tenantName ? `${tenantName} app` : "Mon application",
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    await load();
    onRefresh?.();
    setOpenStep(2);
  }

  async function createGateway(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await apiMutate("/api/v1/lorawan/gateways", "POST", gwForm);
    setBusy(false);
    if (err) {
      if (/duplicate|déjà enregistrée|409/i.test(err)) {
        setError(
          `${err} — Cette gateway existe déjà sur le réseau. Si c'est la vôtre, demandez à un administrateur plateforme de la réaffecter à votre tenant, ou utilisez un autre Gateway ID.`
        );
      } else {
        setError(err);
      }
      return;
    }
    setGwForm({ gatewayId: "", name: "", description: "" });
    await load();
    onRefresh?.();
    setOpenStep(3);
  }

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await apiMutate("/api/v1/lorawan/devices", "POST", devForm);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDevForm({ devEui: "", name: "", applicationId: devForm.applicationId, deviceProfileId: devForm.deviceProfileId, joinEui: "" });
    await load();
    onRefresh?.();
    setOpenStep(4);
  }

  function stepDone(id: number) {
    if (!status) return false;
    if (id === 1) return status.hasApplication && status.hasDeviceProfile;
    if (id === 2) return status.hasGateway;
    if (id === 3) return status.hasDevice;
    if (id === 4) return status.hasTraffic;
    return false;
  }

  return (
    <section className="mb-6 card-live overflow-hidden">
      <div className="border-b border-gray-300 bg-white px-6 py-4">
        <h2 className="text-lg font-bold text-black">Démarrer avec LoRaWAN</h2>
        <p className="mt-1 text-sm text-gray-600">
          Suivez ces étapes pour connecter <strong>{tenantName ?? "votre tenant"}</strong> et recevoir vos premières données.
        </p>
      </div>

      <ol className="divide-y divide-gray-200">
        {STEPS.map((step) => {
          const done = stepDone(step.id);
          const active = openStep === step.id;
          return (
            <li key={step.id} className={active ? "bg-brand-light/30" : "bg-white"}>
              <button
                type="button"
                className="flex w-full items-start gap-4 px-6 py-4 text-left"
                onClick={() => setOpenStep(step.id)}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    done ? "bg-brand text-white" : active ? "border-2 border-brand text-brand" : "border border-gray-300 text-gray-500"
                  }`}
                >
                  {done ? "✓" : step.id}
                </span>
                <span>
                  <span className="font-semibold text-black">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-gray-600">{step.desc}</span>
                </span>
              </button>

              {active && (
                <div className="border-t border-gray-200 bg-white px-6 pb-5 pt-2">
                  {step.id === 1 && (
                    <div className="space-y-3 text-sm">
                      <p className="text-gray-600">
                        Application : {status.hasApplication ? "✓ créée" : "—"} · Profil device :{" "}
                        {status.hasDeviceProfile ? "✓ disponible" : "—"}
                      </p>
                      {write ? (
                        <button
                          type="button"
                          disabled={busy || (status.hasApplication && status.hasDeviceProfile)}
                          onClick={bootstrap}
                          className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
                        >
                          {status.hasApplication && status.hasDeviceProfile
                            ? "Prérequis OK"
                            : busy
                              ? "Initialisation…"
                              : "Initialiser application + profil EU868"}
                        </button>
                      ) : (
                        <p className="text-gray-500">Mode lecture seule — demandez à un operator.</p>
                      )}
                    </div>
                  )}

                  {step.id === 2 && !write && (
                    <p className="text-sm text-gray-500">Connectez-vous en operator pour enregistrer une gateway.</p>
                  )}

                  {step.id === 3 && !write && (
                    <p className="text-sm text-gray-500">Connectez-vous en operator pour créer un device.</p>
                  )}

                  {step.id === 2 && write && (
                    <form onSubmit={createGateway} className="grid gap-3 sm:grid-cols-3">
                      <input
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        placeholder="Gateway ID (EUI64, 16 hex)"
                        value={gwForm.gatewayId}
                        onChange={(e) => setGwForm({ ...gwForm, gatewayId: e.target.value })}
                        required
                      />
                      <input
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        placeholder="Nom"
                        value={gwForm.name}
                        onChange={(e) => setGwForm({ ...gwForm, name: e.target.value })}
                        required
                      />
                      <input
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        placeholder="Description"
                        value={gwForm.description}
                        onChange={(e) => setGwForm({ ...gwForm, description: e.target.value })}
                      />
                      <button type="submit" disabled={busy} className="sm:col-span-3 rounded-lg bg-brand py-2 font-medium text-white disabled:opacity-50">
                        Enregistrer la gateway
                      </button>
                    </form>
                  )}

                  {step.id === 3 && write && (
                    <form onSubmit={createDevice} className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        placeholder="DevEUI (16 hex)"
                        value={devForm.devEui}
                        onChange={(e) => setDevForm({ ...devForm, devEui: e.target.value })}
                        required
                      />
                      <input
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        placeholder="Nom du device"
                        value={devForm.name}
                        onChange={(e) => setDevForm({ ...devForm, name: e.target.value })}
                        required
                      />
                      <select
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        value={devForm.applicationId}
                        onChange={(e) => setDevForm({ ...devForm, applicationId: e.target.value })}
                        required
                      >
                        <option value="">Application…</option>
                        {apps.map((a) => {
                          const id = a.application?.id ?? a.id ?? "";
                          return (
                            <option key={id} value={id}>
                              {a.application?.name ?? id}
                            </option>
                          );
                        })}
                      </select>
                      <select
                        className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
                        value={devForm.deviceProfileId}
                        onChange={(e) => setDevForm({ ...devForm, deviceProfileId: e.target.value })}
                        required
                      >
                        <option value="">Profil device…</option>
                        {profiles.map((p) => {
                          const id = p.deviceProfile?.id ?? p.id ?? "";
                          return (
                            <option key={id} value={id}>
                              {p.deviceProfile?.name ?? id}
                            </option>
                          );
                        })}
                      </select>
                      <button type="submit" disabled={busy} className="sm:col-span-2 rounded-lg bg-brand py-2 font-medium text-white disabled:opacity-50">
                        Créer le device
                      </button>
                    </form>
                  )}

                  {step.id === 4 && (
                    <div className="space-y-3 text-sm text-gray-700">
                      <ol className="list-decimal space-y-2 pl-5">
                        <li>Configurez la gateway physique avec le <strong>Gateway ID</strong> enregistré ci-dessus.</li>
                        <li>Pointez la gateway vers <code className="rounded bg-gray-100 px-1">{typeof window !== "undefined" ? `${window.location.hostname}:1700` : "<IP_VM>:1700"}</code> (UDP Semtech v2) ou BasicStation sur le port <code className="rounded bg-gray-100 px-1">3001</code>.</li>
                        <li>Activez l&apos;envoi des <strong>statistiques gateway (STATS)</strong> toutes les 30 s — sans cela ChirpStack reste OFFLINE.</li>
                        <li>Provisionnez le device (OTAA/ABP) avec le DevEUI créé sur la plateforme.</li>
                        <li>Envoyez un uplink test — le dashboard affichera les données sous 30 secondes.</li>
                      </ol>
                      <div className="flex flex-wrap gap-3">
                        <Link href="/gateways" className="text-brand hover:underline">
                          Voir les gateways →
                        </Link>
                        <Link href="/devices" className="text-brand hover:underline">
                          Voir les devices →
                        </Link>
                        <button type="button" onClick={() => { load(); onRefresh?.(); }} className="text-brand hover:underline">
                          Rafraîchir le statut
                        </button>
                      </div>
                      {status.hasTraffic && (
                        <p className="font-medium text-green-700">Trafic détecté — votre tenant est opérationnel.</p>
                      )}
                    </div>
                  )}

                  {step.id === 5 && (
                    <div className="space-y-3 text-sm">
                      <p className="text-gray-600">
                        L&apos;Agent IA peut créer des devices, diagnostiquer le réseau et répondre à vos questions LoRaWAN.
                      </p>
                      <Link
                        href="/agent"
                        className="inline-block rounded-lg bg-black px-4 py-2 font-medium text-white hover:bg-gray-900"
                      >
                        Ouvrir l&apos;Agent IA →
                      </Link>
                    </div>
                  )}

                  {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

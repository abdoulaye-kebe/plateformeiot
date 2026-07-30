"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section, BtnAccent, BtnPrimary } from "@/components/ui";
import Link from "next/link";

type Connector = {
  id: string;
  name: string;
  type: "http" | "mqtt";
  enabled: boolean;
  events: string[];
  config: Record<string, unknown>;
  createdAt: string;
};

const EMPTY_HTTP = { url: "", headers: {}, timeoutSec: 10 };
const EMPTY_MQTT = {
  brokerUrl: "mqtts://broker.example.com:8883",
  topic: "lorawan/{tenantId}/uplink",
  username: "",
  password: "",
  clientId: "lorawan-platform",
  qos: 1,
  tlsInsecure: false,
};

export default function IntegrationsPage() {
  const { isTenantAdmin, write } = useClientAuth();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"http" | "mqtt">("http");
  const [formName, setFormName] = useState("");
  const [httpCfg, setHttpCfg] = useState(EMPTY_HTTP);
  const [mqttCfg, setMqttCfg] = useState(EMPTY_MQTT);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ result: Connector[] }>("/api/v1/connectors").then((d) => {
      setConnectors(d?.result ?? []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const config = formType === "http" ? httpCfg : mqttCfg;
    const { error: err } = await apiMutate("/api/v1/connectors", "POST", {
      name: formName,
      type: formType,
      enabled: true,
      events: ["uplink"],
      config,
    });
    if (err) {
      setError(err);
      return;
    }
    setShowForm(false);
    setFormName("");
    setHttpCfg(EMPTY_HTTP);
    setMqttCfg(EMPTY_MQTT);
    load();
  }

  async function toggleEnabled(c: Connector) {
    await apiMutate(`/api/v1/connectors/${c.id}`, "PUT", {
      name: c.name,
      type: c.type,
      enabled: !c.enabled,
      events: c.events,
      config: c.config,
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce connecteur ?")) return;
    await apiMutate(`/api/v1/connectors/${id}`, "DELETE");
    load();
  }

  async function test(id: string) {
    setTestResult((r) => ({ ...r, [id]: "Test en cours…" }));
    const { data, error: err } = await apiMutate<{ success: boolean; detail?: string }>(
      `/api/v1/connectors/${id}/test`,
      "POST",
      {}
    );
    if (err || !data) {
      setTestResult((r) => ({ ...r, [id]: err ?? "Échec" }));
      return;
    }
    setTestResult((r) => ({
      ...r,
      [id]: data.success ? `✓ ${data.detail ?? "OK"}` : `✗ ${data.detail ?? "Erreur"}`,
    }));
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Intégrations métier"
        subtitle="Connecteurs sortants HTTP/HTTPS et MQTT/MQTTS — chaque uplink LoRaWAN est transmis à vos applications"
        action={
          write ? (
            <BtnAccent type="button" onClick={() => setShowForm(!showForm)}>
              {showForm ? "Annuler" : "+ Connecteur"}
            </BtnAccent>
          ) : undefined
        }
      />

      <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <p className="font-medium">Format du message (JSON)</p>
        <pre className="mt-2 overflow-x-auto text-xs text-gray-700">{`{
  "event": "uplink",
  "tenantId": "...",
  "device": { "devEui": "...", "applicationId": "..." },
  "radio": { "rssi": -90, "snr": 8.5, "dr": 5 },
  "payload": { "fPort": 1, "fCnt": 42, "hex": "0102ab" },
  "gatewayId": "..."
}`}</pre>
      </div>

      {showForm && write && (
        <Section title="Nouveau connecteur">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Nom</span>
                <input
                  className="input-field min-w-[200px]"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="ERP Production"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Type</span>
                <select
                  className="input-field"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as "http" | "mqtt")}
                >
                  <option value="http">HTTP / HTTPS (webhook)</option>
                  <option value="mqtt">MQTT / MQTTS</option>
                </select>
              </label>
            </div>

            {formType === "http" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-sm lg:col-span-2">
                  <span className="mb-1 block font-medium">URL webhook</span>
                  <input
                    className="input-field font-mono text-xs"
                    value={httpCfg.url}
                    onChange={(e) => setHttpCfg({ ...httpCfg, url: e.target.value })}
                    required
                    placeholder="https://api.metier.com/lorawan/events"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Timeout (s)</span>
                  <input
                    type="number"
                    className="input-field"
                    value={httpCfg.timeoutSec}
                    onChange={(e) => setHttpCfg({ ...httpCfg, timeoutSec: Number(e.target.value) })}
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-sm lg:col-span-2">
                  <span className="mb-1 block font-medium">Broker URL</span>
                  <input
                    className="input-field font-mono text-xs"
                    value={mqttCfg.brokerUrl}
                    onChange={(e) => setMqttCfg({ ...mqttCfg, brokerUrl: e.target.value })}
                    required
                    placeholder="mqtts://broker.example.com:8883"
                  />
                </label>
                <label className="text-sm lg:col-span-2">
                  <span className="mb-1 block font-medium">Topic</span>
                  <input
                    className="input-field font-mono text-xs"
                    value={mqttCfg.topic}
                    onChange={(e) => setMqttCfg({ ...mqttCfg, topic: e.target.value })}
                    required
                    placeholder="lorawan/{tenantId}/uplink"
                  />
                  <span className="mt-1 block text-xs text-gray-500">Variables : {"{tenantId}"}, {"{devEui}"}, {"{applicationId}"}</span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Utilisateur</span>
                  <input className="input-field" value={mqttCfg.username} onChange={(e) => setMqttCfg({ ...mqttCfg, username: e.target.value })} />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium">Mot de passe</span>
                  <input type="password" className="input-field" value={mqttCfg.password} onChange={(e) => setMqttCfg({ ...mqttCfg, password: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mqttCfg.tlsInsecure} onChange={(e) => setMqttCfg({ ...mqttCfg, tlsInsecure: e.target.checked })} />
                  TLS insecure (POC uniquement)
                </label>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <BtnPrimary type="submit">Créer le connecteur</BtnPrimary>
          </form>
        </Section>
      )}

      <Section title={`Connecteurs actifs (${connectors.length})`}>
        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : connectors.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun connecteur — ajoutez un webhook HTTP ou un broker MQTT pour recevoir les uplinks en temps réel.
            {!isTenantAdmin && " Réservé au plan Operator avec feature integrations."}
          </p>
        ) : (
          <ul className="space-y-3">
            {connectors.map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-black">
                      {c.name}{" "}
                      <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs uppercase text-gray-600">{c.type}</span>
                      {!c.enabled && <span className="ml-2 text-xs text-red-500">désactivé</span>}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      {c.type === "http"
                        ? String((c.config as { url?: string }).url ?? "")
                        : `${(c.config as { brokerUrl?: string }).brokerUrl ?? ""} → ${(c.config as { topic?: string }).topic ?? ""}`}
                    </p>
                    {testResult[c.id] && <p className="mt-2 text-xs text-gray-600">{testResult[c.id]}</p>}
                  </div>
                  {write && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => test(c.id)}>
                        Tester
                      </button>
                      <button type="button" className="btn-outline px-3 py-1.5 text-xs" onClick={() => toggleEnabled(c)}>
                        {c.enabled ? "Désactiver" : "Activer"}
                      </button>
                      <button type="button" className="text-xs text-red-600" onClick={() => remove(c.id)}>
                        Supprimer
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="mt-4 text-sm text-gray-500">
        <Link href="/settings" className="text-brand hover:underline">
          ← Retour aux paramètres
        </Link>
        {" · "}
        Les règles conditionnelles restent disponibles dans{" "}
        <Link href="/rules" className="text-brand hover:underline">
          Rules
        </Link>
      </p>
    </div>
  );
}

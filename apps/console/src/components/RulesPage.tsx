"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section, EmptyState } from "@/components/ui";

type Rule = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition: { field?: string; op?: string; value?: number };
  actions: { type?: string; url?: string; message?: string }[];
};

export default function RulesPage() {
  const { write } = useClientAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", field: "rssi", op: "lt", value: -120, webhookUrl: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await apiFetch<{ result: Rule[] }>("/api/v1/rules/");
    setRules(data?.result ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    const actions = form.webhookUrl
      ? [{ type: "webhook", url: form.webhookUrl }, { type: "log", message: form.name }]
      : [{ type: "log", message: form.name }];
    const { error: err } = await apiMutate("/api/v1/rules/", "POST", {
      name: form.name, description: form.description, triggerType: "uplink",
      condition: { field: form.field, op: form.op, value: form.value }, actions,
    });
    if (err) { setError(err); return; }
    setShowForm(false);
    load();
  }

  async function removeRule(id: string) {
    if (!confirm("Supprimer cette règle ?")) return;
    await apiMutate(`/api/v1/rules/${id}`, "DELETE");
    load();
  }

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Règles & routage"
        subtitle="Automatisez le traitement des uplinks : alertes, webhooks vers vos plateformes"
        action={
          <button type="button" onClick={() => write && setShowForm(!showForm)} disabled={!write}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${write ? "bg-brand hover:bg-brand-dark" : "bg-gray-100 text-gray-600 cursor-not-allowed"}`}>
            {showForm ? "Annuler" : "+ Nouvelle règle"}
          </button>
        }
      />
      <RoleBanner />

      {showForm && write && (
        <form onSubmit={createRule} className="mb-8 grid gap-3 rounded-xl border border-gray-200 bg-white p-6 sm:grid-cols-2">
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <select className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}>
            <option value="rssi">RSSI</option><option value="snr">SNR</option><option value="dr">DR</option>
          </select>
          <select className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.op} onChange={(e) => setForm({ ...form, op: e.target.value })}>
            <option value="lt">&lt; inférieur</option><option value="gt">&gt; supérieur</option><option value="eq">= égal</option>
          </select>
          <input type="number" className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          <input className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" placeholder="Webhook URL (HTTPS)" value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} />
          <button type="submit" className="sm:col-span-2 rounded-lg bg-brand py-2 font-medium">Créer règle</button>
          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
        </form>
      )}

      <Section title={`Règles (${rules.length})`}>
        {rules.length === 0 ? (
          <EmptyState message="Exemple : RSSI &lt; -120 dBm → webhook vers votre API." />
        ) : (
          <div className="space-y-3">
            {rules.map((r) => (
              <article key={r.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-gray-500">{r.description || "—"}</p>
                    <p className="mt-2 text-xs text-gray-600">
                      SI {r.condition?.field} {r.condition?.op} {r.condition?.value}
                      {r.actions?.some((a) => a.type === "webhook") && <span className="ml-2 text-brand">→ webhook</span>}
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className={`text-xs ${r.enabled ? "text-brand" : "text-gray-500"}`}>{r.enabled ? "ON" : "OFF"}</span>
                    {write && <button onClick={() => removeRule(r.id)} className="text-xs text-red-600 hover:underline">Suppr.</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

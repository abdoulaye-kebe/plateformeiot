"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, Section } from "@/components/ui";

type AgentConfig = {
  displayName: string;
  systemPrompt?: string | null;
  welcomeMessage?: string | null;
  suggestions: string[];
  enabledBuiltinTools?: string[] | null;
};

type CustomTool = {
  id: string;
  name: string;
  description: string;
  httpMethod: string;
  urlTemplate: string;
  headers: Record<string, string>;
  bodyTemplate?: string | null;
  parameters: Record<string, unknown>;
  enabled: boolean;
};

const EMPTY_TOOL = {
  name: "",
  description: "",
  httpMethod: "GET",
  urlTemplate: "https://api.example.com/resource/{id}",
  headers: "{}",
  bodyTemplate: "",
  parameters: '{\n  "type": "object",\n  "properties": {\n    "id": { "type": "string", "description": "Identifiant" }\n  },\n  "required": ["id"]\n}',
  enabled: true,
};

export default function AgentSettingsPage() {
  const { isTenantAdmin } = useClientAuth();
  const [displayName, setDisplayName] = useState("Agent IA");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [suggestionsText, setSuggestionsText] = useState("");
  const [availableBuiltin, setAvailableBuiltin] = useState<string[]>([]);
  const [enabledBuiltin, setEnabledBuiltin] = useState<string[]>([]);
  const [allBuiltin, setAllBuiltin] = useState(true);
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);
  const [draft, setDraft] = useState(EMPTY_TOOL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    apiFetch<{
      config: AgentConfig & { suggestions?: string[] | unknown };
      customTools: CustomTool[];
      availableBuiltinTools: string[];
      enabledBuiltinTools: string[];
    }>("/api/v1/agent/config").then((data) => {
      if (!data?.config) return;
      const cfg = data.config;
      setDisplayName(cfg.displayName || "Agent IA");
      setSystemPrompt(cfg.systemPrompt || "");
      setWelcomeMessage(cfg.welcomeMessage || "");
      const sugg = Array.isArray(cfg.suggestions) ? cfg.suggestions : [];
      setSuggestionsText(sugg.join("\n"));
      setAvailableBuiltin(data.availableBuiltinTools || []);
      const enabled = data.enabledBuiltinTools || [];
      setEnabledBuiltin(enabled);
      setAllBuiltin(enabled.length === 0);
      setCustomTools(data.customTools || []);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!isTenantAdmin) {
    return (
      <div className="p-4 lg:p-6">
        <PageHeader title="Configuration Agent IA" subtitle="Réservé aux administrateurs tenant" />
        <p className="text-sm text-gray-600">Connectez-vous en tenant-admin pour personnaliser l&apos;agent.</p>
      </div>
    );
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    const suggestions = suggestionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const { error: err } = await apiMutate("/api/v1/agent/config", "PUT", {
      displayName,
      systemPrompt: systemPrompt.trim() || null,
      welcomeMessage: welcomeMessage.trim() || null,
      suggestions,
      enabledBuiltinTools: allBuiltin ? null : enabledBuiltin,
    });
    if (err) {
      setError(err);
      return;
    }
    setStatus("Configuration enregistrée.");
    load();
  }

  function toggleBuiltin(name: string) {
    setAllBuiltin(false);
    setEnabledBuiltin((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function saveCustomTool(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let headers: Record<string, string> = {};
    let parameters: Record<string, unknown> = {};
    try {
      headers = JSON.parse(draft.headers || "{}");
      parameters = JSON.parse(draft.parameters || "{}");
    } catch {
      setError("Headers ou parameters JSON invalides.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      httpMethod: draft.httpMethod,
      urlTemplate: draft.urlTemplate.trim(),
      headers,
      bodyTemplate: draft.bodyTemplate?.trim() || null,
      parameters,
      enabled: draft.enabled,
    };
    const { error: err } = editingId
      ? await apiMutate(`/api/v1/agent/custom-tools/${editingId}`, "PUT", payload)
      : await apiMutate("/api/v1/agent/custom-tools", "POST", payload);
    if (err) {
      setError(err);
      return;
    }
    setDraft(EMPTY_TOOL);
    setEditingId(null);
    setStatus("Outil personnalisé enregistré.");
    load();
  }

  async function removeTool(id: string) {
    if (!confirm("Supprimer cet outil ?")) return;
    await apiMutate(`/api/v1/agent/custom-tools/${id}`, "DELETE");
    load();
  }

  function editTool(tool: CustomTool) {
    setEditingId(tool.id);
    setDraft({
      name: tool.name,
      description: tool.description,
      httpMethod: tool.httpMethod,
      urlTemplate: tool.urlTemplate,
      headers: JSON.stringify(tool.headers || {}, null, 2),
      bodyTemplate: tool.bodyTemplate || "",
      parameters: JSON.stringify(tool.parameters || {}, null, 2),
      enabled: tool.enabled,
    });
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        title="Configuration Agent IA"
        subtitle="Personnalisez le prompt, les suggestions et les outils (Ollama local — moteur unique)"
      />
      <p className="mb-6 text-sm text-gray-600">
        <Link href="/agent" className="text-brand hover:underline">← Retour au chat agent</Link>
      </p>

      {status && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">{status}</p>}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <form onSubmit={saveConfig} className="mb-8 space-y-6">
        <Section title="Identité & prompts">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-gray-700">Nom affiché</span>
              <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Message d&apos;accueil</span>
            <textarea className={inputCls} rows={3} value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} />
          </label>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Prompt système (optionnel)</span>
            <textarea
              className={`${inputCls} font-mono text-xs`}
              rows={5}
              placeholder="Laissez vide pour le prompt par défaut LoRaWAN…"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </label>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Suggestions rapides (une par ligne)</span>
            <textarea className={inputCls} rows={4} value={suggestionsText} onChange={(e) => setSuggestionsText(e.target.value)} />
          </label>
          <button type="submit" className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Enregistrer la configuration
          </button>
        </Section>
      </form>

      <Section title="Outils MCP intégrés (whitelist)">
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allBuiltin} onChange={(e) => { setAllBuiltin(e.target.checked); if (e.target.checked) setEnabledBuiltin([]); }} />
          Tous les outils MCP intégrés activés
        </label>
        {!allBuiltin && (
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableBuiltin.map((name) => (
                <label key={name} className="flex items-center gap-2 text-xs font-mono">
                  <input type="checkbox" checked={enabledBuiltin.includes(name)} onChange={() => toggleBuiltin(name)} />
                  {name}
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          onClick={async () => {
            const suggestions = suggestionsText.split("\n").map((s) => s.trim()).filter(Boolean);
            await apiMutate("/api/v1/agent/config", "PUT", {
              displayName,
              systemPrompt: systemPrompt.trim() || null,
              welcomeMessage: welcomeMessage.trim() || null,
              suggestions,
              enabledBuiltinTools: allBuiltin ? null : enabledBuiltin,
            });
            setStatus("Liste d'outils MCP enregistrée.");
          }}
        >
          Enregistrer la sélection MCP
        </button>
      </Section>

      <Section title="Outils HTTP personnalisés (simples)">
        <p className="mb-4 text-sm text-gray-600">
          Définissez des appels HTTP que l&apos;agent peut déclencher. Utilisez <code className="rounded bg-gray-100 px-1">{`{param}`}</code> dans
          l&apos;URL ou le body. Exemple : <code className="rounded bg-gray-100 px-1">https://api.suez.sn/tickets/{"{ticket_id}"}</code>
        </p>

        <ul className="mb-6 space-y-2">
          {customTools.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <div>
                <span className="font-mono text-brand">{t.name}</span>
                <span className="ml-2 text-gray-500">{t.httpMethod}</span>
                <p className="text-xs text-gray-500">{t.description}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="text-xs text-brand hover:underline" onClick={() => editTool(t)}>Modifier</button>
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeTool(t.id)}>Supprimer</button>
              </div>
            </li>
          ))}
          {customTools.length === 0 && <li className="text-sm text-gray-500">Aucun outil personnalisé.</li>}
        </ul>

        <form onSubmit={saveCustomTool} className="rounded-xl border border-gray-200 bg-neutral-50 p-4">
          <h3 className="mb-3 text-sm font-semibold">{editingId ? "Modifier l'outil" : "Nouvel outil HTTP"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputCls} placeholder="name (snake_case)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            <select className={inputCls} value={draft.httpMethod} onChange={(e) => setDraft({ ...draft, httpMethod: e.target.value })}>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <input className={`${inputCls} mt-3`} placeholder="Description pour l'agent" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required />
          <input className={`${inputCls} mt-3 font-mono text-xs`} placeholder="URL template" value={draft.urlTemplate} onChange={(e) => setDraft({ ...draft, urlTemplate: e.target.value })} required />
          <textarea className={`${inputCls} mt-3 font-mono text-xs`} rows={2} placeholder='Headers JSON {"Authorization":"Bearer xxx"}' value={draft.headers} onChange={(e) => setDraft({ ...draft, headers: e.target.value })} />
          <textarea className={`${inputCls} mt-3 font-mono text-xs`} rows={2} placeholder="Body template (optionnel, JSON avec {params})" value={draft.bodyTemplate} onChange={(e) => setDraft({ ...draft, bodyTemplate: e.target.value })} />
          <textarea className={`${inputCls} mt-3 font-mono text-xs`} rows={5} placeholder="JSON Schema parameters" value={draft.parameters} onChange={(e) => setDraft({ ...draft, parameters: e.target.value })} required />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark">
              {editingId ? "Mettre à jour" : "Ajouter l'outil"}
            </button>
            {editingId && (
              <button type="button" className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => { setEditingId(null); setDraft(EMPTY_TOOL); }}>
                Annuler
              </button>
            )}
          </div>
        </form>
      </Section>
    </div>
  );
}

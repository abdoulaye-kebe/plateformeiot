"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner, Section } from "@/components/ui";

type FormKind = "device" | "gateway";
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  form?: FormKind;
  formDone?: boolean;
};
type Tool = { name: string; description: string };

const HEX16 = /^[0-9a-fA-F]{16}$/;
const HEX32 = /^[0-9a-fA-F]{32}$/;

const SUGGESTIONS = [
  "Donne-moi une vue d'ensemble du réseau",
  "Combien de gateways avons-nous ?",
  "Liste les devices",
  "Ajoute un device",
  "Ajoute une gateway",
  "Quels devices ont une batterie faible ?",
];

function DeviceForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (cmd: string) => void }) {
  const [devEui, setDevEui] = useState("");
  const [joinEui, setJoinEui] = useState("");
  const [appKey, setAppKey] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!HEX16.test(devEui)) return setErr("DevEUI invalide (16 caractères hex).");
    if (!HEX16.test(joinEui)) return setErr("JoinEUI invalide (16 caractères hex).");
    if (!HEX32.test(appKey)) return setErr("AppKey invalide (32 caractères hex).");
    setErr("");
    const nom = name.trim() ? `, nom: ${name.trim()}` : "";
    onSubmit(
      `je veux créer un device classe A avec DevEUI: ${devEui.toLowerCase()}, JoinEUI: ${joinEui.toLowerCase()}, AppKey: ${appKey.toLowerCase()}${nom}`
    );
  };

  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono";

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <input className={inputCls} placeholder="DevEUI * (16 hex)" value={devEui} onChange={(e) => setDevEui(e.target.value)} disabled={disabled} />
      <input className={inputCls} placeholder="JoinEUI * (16 hex)" value={joinEui} onChange={(e) => setJoinEui(e.target.value)} disabled={disabled} />
      <input className={inputCls} placeholder="AppKey * (32 hex)" value={appKey} onChange={(e) => setAppKey(e.target.value)} disabled={disabled} />
      <input className={inputCls} placeholder="Nom (optionnel)" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button type="submit" disabled={disabled} className="rounded-lg bg-brand px-4 py-2 text-sm hover:bg-brand-dark disabled:opacity-50">
        Créer le device
      </button>
    </form>
  );
}

function GatewayForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (cmd: string) => void }) {
  const [gatewayId, setGatewayId] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!HEX16.test(gatewayId)) return setErr("Gateway ID invalide (16 caractères hex).");
    if (!name.trim()) return setErr("Le nom est obligatoire.");
    setErr("");
    onSubmit(`crée une gateway ${gatewayId.toLowerCase()} nommée ${name.trim()}`);
  };

  const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono";

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-gray-200 pt-3">
      <input className={inputCls} placeholder="Gateway ID * (16 hex)" value={gatewayId} onChange={(e) => setGatewayId(e.target.value)} disabled={disabled} />
      <input className={inputCls} placeholder="Nom * (ex: GW-Lyon)" value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} />
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button type="submit" disabled={disabled} className="rounded-lg bg-brand px-4 py-2 text-sm hover:bg-brand-dark disabled:opacity-50">
        Créer la gateway
      </button>
    </form>
  );
}

export default function AgentChatPage() {
  const { write } = useClientAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis votre agent LoRaWAN. Je peux lister, créer, modifier et diagnostiquer vos gateways et devices.\n\nDites « ajoute un device » ou « ajoute une gateway » pour un formulaire guidé.\n\nPour supprimer, ajoutez **confirm** à la fin.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tools, setTools] = useState<Tool[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ tools: Tool[] }>("/api/v1/agent/tools").then((d) => setTools(d?.tools ?? []));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text: string, markFormDoneIdx?: number) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput("");
    if (markFormDoneIdx !== undefined) {
      setMessages((m) => m.map((item, i) => (i === markFormDoneIdx ? { ...item, formDone: true } : item)));
    }
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    const { data, error } = await apiMutate<{ answer: string; provider: string; form?: FormKind }>(
      "/api/v1/agent/chat",
      "POST",
      { message: msg }
    );
    setLoading(false);
    if (error || !data) {
      setMessages((m) => [...m, { role: "assistant", content: `Erreur : ${error ?? "agent indisponible"}. Vérifiez que ai-agent tourne (port 8096).` }]);
      return;
    }
    setMessages((m) => [
      ...m,
      { role: "assistant", content: data.answer, provider: data.provider, form: data.form as FormKind | undefined },
    ]);
  }, [loading]);

  return (
    <div className="flex h-full min-h-[calc(100vh-0px)]">
      <div className="flex flex-1 flex-col p-8">
        <PageHeader
          title="Agent IA LoRaWAN"
          subtitle="Assistant intelligent — CRUD réseau, diagnostics, métriques radio (MCP + Ollama)"
        />
        <RoleBanner />

        {!write && (
          <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-sm text-sky-200">
            Mode viewer : lecture et diagnostics OK. Pour créer/supprimer via l&apos;agent, connectez-vous en <strong>operator</strong>.
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={loading}
              className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {s.length > 42 ? s.slice(0, 42) + "…" : s}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white">
          <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ minHeight: "360px", maxHeight: "calc(100vh - 340px)" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-brand/20 text-gray-900"
                      : "bg-neutral-100 text-gray-800 border border-gray-200"
                  }`}
                >
                  {m.content}
                  {m.form === "device" && !m.formDone && write && (
                    <DeviceForm disabled={loading} onSubmit={(cmd) => send(cmd, i)} />
                  )}
                  {m.form === "gateway" && !m.formDone && write && (
                    <GatewayForm disabled={loading} onSubmit={(cmd) => send(cmd, i)} />
                  )}
                  {m.form && !write && (
                    <p className="mt-2 text-xs text-sky-400">Connectez-vous en operator pour créer des ressources.</p>
                  )}
                  {m.provider && m.role === "assistant" && (
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-500">via {m.provider}</p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-gray-200 bg-neutral-100 px-4 py-3 text-sm text-gray-600 animate-pulse">
                  L&apos;agent analyse votre demande…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex gap-2 border-t border-gray-200 p-4"
          >
            <input
              className="flex-1 rounded-xl border border-gray-300 bg-neutral-100 px-4 py-3 text-sm"
              placeholder="Posez votre question… (ex: ajoute un device, liste les gateways…)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-brand px-6 py-3 text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
            >
              Envoyer
            </button>
          </form>
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 border-l border-gray-200 bg-white p-4 xl:block">
        <Section title={`Outils MCP (${tools.length})`}>
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto text-xs text-gray-600">
            {tools.map((t) => (
              <li key={t.name} className="rounded border border-gray-200 p-2">
                <p className="font-mono text-brand">{t.name}</p>
                <p className="mt-1 text-gray-500">{t.description?.slice(0, 80)}…</p>
              </li>
            ))}
          </ul>
        </Section>
      </aside>
    </div>
  );
}

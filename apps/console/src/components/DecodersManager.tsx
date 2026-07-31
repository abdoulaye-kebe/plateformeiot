"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { Section, EmptyState, BtnPrimary } from "@/components/ui";
import { testDecodeUplink } from "@/lib/codecTest";

type Decoder = {
  id: string;
  name: string;
  description: string;
  vendor: string;
  script: string;
  downlinkFPort: number;
  deviceProfileId?: string;
  updatedAt: string;
};

type ProfileRow = {
  id?: string;
  deviceProfile?: { id?: string; name?: string; payloadCodecRuntime?: string };
};

type TemplateInfo = {
  script?: string;
  downlinkFPort?: number;
};

const EMPTY_FORM = {
  name: "",
  description: "",
  vendor: "",
  script: "",
  downlinkFPort: 1,
};

export default function DecodersManager() {
  const { write } = useClientAuth();
  const [decoders, setDecoders] = useState<Decoder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isNew, setIsNew] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileId, setProfileId] = useState("");
  const [testHex, setTestHex] = useState("01020304");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [decData, profData] = await Promise.all([
      apiFetch<{ result: Decoder[] }>("/api/v1/decoders"),
      apiFetch<{ result?: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=50"),
    ]);
    const list = decData?.result ?? [];
    setDecoders(list);
    setProfiles(profData?.result ?? []);
    setLoading(false);
    return list;
  }, []);

  useEffect(() => {
    load().then((list) => {
      if (list.length > 0 && !selectedId && !isNew) {
        selectDecoder(list[0]);
      }
    });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectDecoder(dec: Decoder) {
    setIsNew(false);
    setSelectedId(dec.id);
    setForm({
      name: dec.name,
      description: dec.description,
      vendor: dec.vendor,
      script: dec.script,
      downlinkFPort: dec.downlinkFPort || 1,
    });
    setTestResult(null);
    setMessage("");
    setError("");
    if (dec.deviceProfileId) {
      setProfileId(dec.deviceProfileId);
    }
  }

  async function startNew() {
    setIsNew(true);
    setSelectedId(null);
    setTestResult(null);
    setMessage("");
    setError("");
    const tpl = await apiFetch<TemplateInfo>("/api/v1/decoders/template");
    setForm({
      ...EMPTY_FORM,
      script: tpl?.script ?? "",
      downlinkFPort: tpl?.downlinkFPort ?? 1,
    });
  }

  async function importShengda() {
    setError("");
    const codec = await apiFetch<{ script?: string; name?: string; vendor?: string; downlinkFPort?: number }>(
      "/api/v1/shengda/codec"
    );
    if (!codec?.script) {
      setError("Codec Shengda indisponible — démarrez shengda-water.");
      return;
    }
    setForm((f) => ({
      ...f,
      name: f.name || codec.name || "Shengda Water Meter V1.6",
      vendor: codec.vendor || "shengda",
      script: codec.script ?? f.script,
      downlinkFPort: codec.downlinkFPort ?? 2,
      description: f.description || "Télérelevé eau et contrôle vanne (port downlink 2)",
    }));
    setIsNew(true);
    setSelectedId(null);
  }

  async function saveDecoder(e: FormEvent) {
    e.preventDefault();
    if (!write) return;
    setBusy(true);
    setError("");
    setMessage("");

    const body = {
      name: form.name.trim(),
      description: form.description,
      vendor: form.vendor,
      script: form.script,
      downlinkFPort: form.downlinkFPort,
    };

    if (!body.name) {
      setError("Le nom est obligatoire.");
      setBusy(false);
      return;
    }

    if (isNew || !selectedId) {
      const { data, error: err } = await apiMutate<Decoder>("/api/v1/decoders", "POST", body);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
      setMessage("Décodeur créé.");
      setIsNew(false);
      if (data?.id) {
        setSelectedId(data.id);
      }
      const list = await load();
      const created = list.find((d) => d.id === data?.id) ?? list[0];
      if (created) selectDecoder(created);
      return;
    }

    const { error: err } = await apiMutate(`/api/v1/decoders/${selectedId}`, "PUT", body);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage("Décodeur enregistré.");
    const list = await load();
    const updated = list.find((d) => d.id === selectedId);
    if (updated) selectDecoder(updated);
  }

  async function removeDecoder() {
    if (!write || !selectedId) return;
    if (!confirm("Supprimer ce décodeur ?")) return;
    setBusy(true);
    const { error: err } = await apiMutate(`/api/v1/decoders/${selectedId}`, "DELETE");
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSelectedId(null);
    setIsNew(false);
    setForm(EMPTY_FORM);
    const list = await load();
    if (list.length > 0) {
      selectDecoder(list[0]);
    }
    setMessage("Décodeur supprimé.");
  }

  async function testDecode() {
    setError("");
    try {
      const result = testDecodeUplink(form.script, testHex, form.downlinkFPort);
      setTestResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de décodage");
      setTestResult(null);
    }
  }

  async function applyToChirpStack(createNew: boolean) {
    if (!write || !selectedId) return;
    setBusy(true);
    setError("");
    setMessage("");
    const body = createNew
      ? { create: true, name: form.name, description: form.description }
      : { deviceProfileId: profileId, create: false };
    const { error: err } = await apiMutate(`/api/v1/decoders/${selectedId}/apply`, "POST", body);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setMessage(
      createNew
        ? "Device profile créé avec le codec JavaScript."
        : "Codec appliqué au device profile sélectionné."
    );
    load();
  }

  function profileLabel(row: ProfileRow) {
    const id = row.deviceProfile?.id ?? row.id ?? "";
    const name = row.deviceProfile?.name ?? id;
    const runtime = row.deviceProfile?.payloadCodecRuntime;
    return runtime ? `${name} (${runtime})` : name;
  }

  const editing = isNew || !!selectedId;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Mes décodeurs</h2>
          {write && (
            <button type="button" onClick={startNew} className="text-xs font-medium text-brand hover:underline">
              + Nouveau
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-gray-500">Chargement…</p>
        ) : decoders.length === 0 && !isNew ? (
          <EmptyState message="Aucun décodeur — créez-en un ou importez Shengda." />
        ) : (
          <ul className="space-y-1">
            {decoders.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => selectDecoder(d)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedId === d.id && !isNew
                      ? "bg-brand-light font-medium text-brand-dark"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block truncate">{d.name}</span>
                  {d.vendor && <span className="block truncate text-xs text-gray-500">{d.vendor}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {write && (
          <button
            type="button"
            onClick={importShengda}
            className="mt-4 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:border-brand hover:text-brand"
          >
            Importer modèle Shengda
          </button>
        )}
      </aside>

      <div>
        {!editing ? (
          <Section title="Décodeur JavaScript">
            <p className="text-sm text-gray-600">
              Sélectionnez un décodeur dans la liste ou créez-en un nouveau pour vos futurs devices LoRaWAN.
            </p>
            {write && (
              <BtnPrimary type="button" onClick={startNew} className="mt-4">
                Créer un décodeur
              </BtnPrimary>
            )}
          </Section>
        ) : (
          <form onSubmit={saveDecoder}>
            <Section title={isNew ? "Nouveau décodeur" : `Éditer — ${form.name}`}>
              <p className="mb-4 text-sm text-gray-600">
                Codecs ChirpStack v4 : fonctions <code className="font-mono text-xs">decodeUplink(input)</code> et{" "}
                <code className="font-mono text-xs">encodeDownlink(input)</code> en JavaScript (QuickJS).
              </p>

              {(message || error) && (
                <p
                  className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                    error ? "border-red-200 bg-red-50 text-red-700" : "border-brand bg-brand-light text-brand-dark"
                  }`}
                >
                  {error || message}
                </p>
              )}

              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Nom *</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                    disabled={!write}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Fabricant / vendor</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 text-sm"
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    placeholder="ex. shengda, dragino…"
                    disabled={!write}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 text-sm"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    disabled={!write}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Port downlink par défaut</label>
                  <input
                    type="number"
                    min={1}
                    max={223}
                    className="w-full rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 text-sm"
                    value={form.downlinkFPort}
                    onChange={(e) => setForm({ ...form, downlinkFPort: Number(e.target.value) || 1 })}
                    disabled={!write}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-gray-600">Script JavaScript</label>
                <textarea
                  className="h-72 w-full rounded-lg border border-gray-300 bg-gray-950 p-3 font-mono text-xs leading-relaxed text-gray-100"
                  value={form.script}
                  onChange={(e) => setForm({ ...form, script: e.target.value })}
                  spellCheck={false}
                  disabled={!write}
                />
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Tester un payload hex (uplink)</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 font-mono text-xs"
                      value={testHex}
                      onChange={(e) => setTestHex(e.target.value)}
                      placeholder="241A003c"
                    />
                    <button
                      type="button"
                      onClick={testDecode}
                      disabled={!form.script.trim()}
                      className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Décoder
                    </button>
                  </div>
                  {testResult ? (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-emerald-300">
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">Test local du script avant enregistrement.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Appliquer dans ChirpStack</label>
                  <select
                    className="mb-2 w-full rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 text-sm"
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                  >
                    <option value="">— Device profile —</option>
                    {profiles.map((p) => {
                      const id = p.deviceProfile?.id ?? p.id ?? "";
                      return (
                        <option key={id} value={id}>
                          {profileLabel(p)}
                        </option>
                      );
                    })}
                  </select>
                  {write ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || !selectedId || !profileId}
                        onClick={() => applyToChirpStack(false)}
                        className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Appliquer au profile
                      </button>
                      <button
                        type="button"
                        disabled={busy || !selectedId}
                        onClick={() => applyToChirpStack(true)}
                        className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand disabled:opacity-50"
                      >
                        + Créer device profile
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Mode viewer — lecture seule.</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    ChirpStack → Device profiles → Codec → Custom JavaScript functions
                  </p>
                </div>
              </div>

              {write && (
                <div className="flex flex-wrap gap-2">
                  <BtnPrimary type="submit" disabled={busy}>
                    {busy ? "Enregistrement…" : isNew ? "Créer" : "Enregistrer"}
                  </BtnPrimary>
                  {!isNew && selectedId && (
                    <button
                      type="button"
                      onClick={removeDecoder}
                      disabled={busy}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              )}
            </Section>
          </form>
        )}
      </div>
    </div>
  );
}

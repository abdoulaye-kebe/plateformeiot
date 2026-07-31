"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { Section, EmptyState } from "@/components/ui";

type CodecInfo = {
  name?: string;
  vendor?: string;
  payloadCodecRuntime?: string;
  downlinkFPort?: number;
  script?: string;
};

type ProfileRow = {
  id?: string;
  deviceProfile?: { id?: string; name?: string; payloadCodecRuntime?: string };
};

type DecodeResult = Record<string, unknown>;

export default function ShengdaCodecPanel() {
  const { write } = useClientAuth();
  const [codec, setCodec] = useState<CodecInfo | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [profileId, setProfileId] = useState("");
  const [testHex, setTestHex] = useState("241A003c");
  const [decoded, setDecoded] = useState<DecodeResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      apiFetch<CodecInfo>("/api/v1/shengda/codec"),
      apiFetch<{ result?: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=50"),
    ]);
    setCodec(c);
    const rows = p?.result ?? [];
    setProfiles(rows);
    if (!profileId && rows.length > 0) {
      const first = rows[0].deviceProfile?.id ?? rows[0].id ?? "";
      setProfileId(first);
    }
  }, [profileId]);

  useEffect(() => {
    load();
  }, [load]);

  function profileLabel(row: ProfileRow) {
    const id = row.deviceProfile?.id ?? row.id ?? "";
    const name = row.deviceProfile?.name ?? id;
    const runtime = row.deviceProfile?.payloadCodecRuntime;
    return runtime ? `${name} (${runtime})` : name;
  }

  async function testDecode() {
    setMessage("");
    const data = await apiMutate<DecodeResult>("/api/v1/shengda/decode", "POST", { hex: testHex });
    if (data.error) {
      setMessage(data.error);
      setDecoded(null);
      return;
    }
    setDecoded(data.data);
  }

  async function copyScript() {
    if (!codec?.script) return;
    await navigator.clipboard.writeText(codec.script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function applyCodec(createNew: boolean) {
    if (!write) return;
    setBusy(true);
    setMessage("");
    const body = createNew
      ? { create: true, name: "Shengda Water Meter V1.6" }
      : { deviceProfileId: profileId, create: false };
    const { error } = await apiMutate("/api/v1/shengda/codec/apply", "POST", body);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage(
      createNew
        ? "Device profile Shengda créé avec le codec JavaScript."
        : "Codec JavaScript appliqué au device profile sélectionné."
    );
    load();
  }

  return (
    <Section title="Décodeur device JavaScript (ChirpStack)">
      <p className="mb-4 text-sm text-gray-600">
        Codec <strong>Shengda V1.6</strong> pour ChirpStack : <code className="font-mono text-xs">decodeUplink</code>{" "}
        (index m³, vanne, batterie) et <code className="font-mono text-xs">encodeDownlink</code> (ouvrir/fermer vanne, port{" "}
        {codec?.downlinkFPort ?? 2}).
      </p>

      {message && (
        <p className="mb-4 rounded-lg border border-brand bg-brand-light px-3 py-2 text-sm text-brand-dark">{message}</p>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tester un payload hex (uplink)</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-300 bg-neutral-50 px-3 py-2 font-mono text-xs"
              value={testHex}
              onChange={(e) => setTestHex(e.target.value)}
              placeholder="241605f5e1..."
            />
            <button type="button" onClick={testDecode} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">
              Décoder
            </button>
          </div>
          {decoded ? (
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-emerald-300">
              {JSON.stringify(decoded, null, 2)}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-gray-500">Ex. batterie 3,66 V : 241A003c</p>
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
                disabled={busy || !profileId}
                onClick={() => applyCodec(false)}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Appliquer au profile
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => applyCodec(true)}
                className="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand disabled:opacity-50"
              >
                + Créer profile Shengda
              </button>
              <button type="button" onClick={copyScript} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {copied ? "Copié !" : "Copier le JS"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Mode viewer — copiez le script manuellement dans ChirpStack.</p>
          )}
          <p className="mt-2 text-xs text-gray-500">
            ChirpStack → Tenants → Device profiles → Codec → Custom JavaScript functions
          </p>
        </div>
      </div>

      {!codec?.script ? (
        <EmptyState message="Codec non disponible — démarrez le service shengda-water (port 8098)." />
      ) : (
        <details className="rounded-lg border border-gray-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Voir le code JavaScript ({codec.name})</summary>
          <pre className="max-h-96 overflow-auto border-t border-gray-200 bg-gray-950 p-4 text-xs leading-relaxed text-gray-100">
            {codec.script}
          </pre>
        </details>
      )}
    </Section>
  );
}

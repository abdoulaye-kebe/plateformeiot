"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate, apiDownload } from "@/lib/api";
import { Section } from "@/components/ui";

type LnsMode = {
  enabled: boolean;
  host: string;
  port: number;
  protocol: string;
  note?: string;
};

type ConnectivityResponse = {
  gatewayId: string;
  preferredMode?: string;
  vpnProfileAvailable?: boolean;
  vpnCertIssuedAt?: string;
  platform: {
    publicHost: string;
    semtechUdp: LnsMode;
    basicStation: LnsMode;
    openVpn: {
      enabled: boolean;
      serverHost: string;
      serverPort: number;
      tunGatewayIp: string;
      semtechHost: string;
      semtechPort: number;
      basicStationHost: string;
      basicStationPort: number;
      note?: string;
    };
  };
  modes: string[];
};

const MODE_LABELS: Record<string, string> = {
  semtech_udp: "Semtech UDP (Packet Forwarder)",
  basic_station: "Basic Station",
  openvpn: "OpenVPN (tunnel sécurisé)",
};

type Props = {
  gatewayId: string;
  write: boolean;
};

export default function GatewayConnectivityPanel({ gatewayId, write }: Props) {
  const [data, setData] = useState<ConnectivityResponse | null>(null);
  const [mode, setMode] = useState("semtech_udp");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vpnBusy, setVpnBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const resp = await apiFetch<ConnectivityResponse>(`/api/v1/lorawan/gateways/${gatewayId}/connectivity`);
    if (resp && !("error" in (resp as object))) {
      setData(resp);
      setMode(resp.preferredMode ?? "semtech_udp");
    } else {
      setError("Impossible de charger la connectivité");
    }
    setLoading(false);
  }, [gatewayId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveMode(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error: err } = await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}/connectivity`, "PUT", {
      preferredMode: mode,
    });
    if (err) setError(err);
    else await load();
    setSaving(false);
  }

  async function downloadVpn() {
    setVpnBusy(true);
    setError(null);
    const { blob, error: err } = await apiDownload(`/api/v1/lorawan/gateways/${gatewayId}/vpn/profile`, "POST");
    if (err || !blob) {
      setError(err ?? "Échec téléchargement VPN");
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${gatewayId}.ovpn`;
      a.click();
      URL.revokeObjectURL(url);
      await load();
    }
    setVpnBusy(false);
  }

  async function revokeVpn() {
    if (!confirm("Révoquer le certificat OpenVPN de cette gateway ?")) return;
    setVpnBusy(true);
    const { error: err } = await apiMutate(`/api/v1/lorawan/gateways/${gatewayId}/vpn/profile`, "DELETE");
    if (err) setError(err);
    else await load();
    setVpnBusy(false);
  }

  if (loading) {
    return (
      <Section title="Connectivité LNS">
        <p className="text-sm text-gray-500">Chargement…</p>
      </Section>
    );
  }

  const p = data?.platform;
  if (!p) {
    return (
      <Section title="Connectivité LNS">
        <p className="text-sm text-red-600">{error ?? "Configuration indisponible"}</p>
      </Section>
    );
  }

  return (
    <Section title="Connectivité LNS — 3 modes supportés">
      <p className="mb-4 text-sm text-gray-600">
        La plateforme accepte les gateways via <strong>Semtech UDP</strong>, <strong>Basic Station</strong> ou{" "}
        <strong>OpenVPN</strong> (PKI intégrée). Choisissez le mode adapté à votre gateway (backhaul cellulaire, client OpenVPN embarqué, etc.).
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-medium text-gray-900">1. Semtech UDP</h3>
          <p className="mt-1 text-xs text-gray-500">{p.semtechUdp.note}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Serveur</dt>
              <dd className="font-mono text-xs">{p.semtechUdp.host}:{p.semtechUdp.port}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Protocole</dt>
              <dd>UDP</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="font-medium text-gray-900">2. Basic Station</h3>
          <p className="mt-1 text-xs text-gray-500">{p.basicStation.note}</p>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Serveur</dt>
              <dd className="font-mono text-xs">{p.basicStation.host}:{p.basicStation.port}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Protocole</dt>
              <dd>TCP / TLS</dd>
            </div>
          </dl>
        </div>

        <div className={`rounded-lg border p-4 shadow-sm ${p.openVpn.enabled ? "border-brand/40 bg-brand/5" : "border-gray-200 bg-gray-50 opacity-80"}`}>
          <h3 className="font-medium text-gray-900">3. OpenVPN + PKI</h3>
          <p className="mt-1 text-xs text-gray-500">{p.openVpn.note}</p>
          {p.openVpn.enabled ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">VPN</dt>
                <dd className="font-mono text-xs">{p.openVpn.serverHost}:{p.openVpn.serverPort}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">LNS (tunnel)</dt>
                <dd className="font-mono text-xs">{p.openVpn.tunGatewayIp}:{p.openVpn.semtechPort}</dd>
              </div>
              {data?.vpnProfileAvailable && (
                <div className="pt-1 text-xs text-green-700">Profil émis — certificat actif</div>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-amber-700">Service OpenVPN non activé sur cette instance</p>
          )}
        </div>
      </div>

      {write && (
        <form onSubmit={saveMode} className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">Mode privilégié</span>
            <select
              className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              {(data?.modes ?? []).map((m) => (
                <option key={m} value={m} disabled={m === "openvpn" && !p.openVpn.enabled}>
                  {MODE_LABELS[m] ?? m}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Enregistrer
          </button>
        </form>
      )}

      {write && p.openVpn.enabled && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={vpnBusy}
            onClick={downloadVpn}
            className="rounded-lg border border-brand bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-50"
          >
            Télécharger profil .ovpn
          </button>
          {data?.vpnProfileAvailable && (
            <button
              type="button"
              disabled={vpnBusy}
              onClick={revokeVpn}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Révoquer certificat
            </button>
          )}
        </div>
      )}

      {mode === "openvpn" && p.openVpn.enabled && (
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>Téléchargez le profil <code className="rounded bg-gray-100 px-1">{gatewayId}.ovpn</code></li>
          <li>Importez-le dans le client OpenVPN de la gateway (RAK, Multitech, etc.)</li>
          <li>Après connexion VPN, configurez le packet forwarder vers <code className="rounded bg-gray-100 px-1">{p.openVpn.tunGatewayIp}:{p.openVpn.semtechPort}</code> (UDP) ou Basic Station <code className="rounded bg-gray-100 px-1">{p.openVpn.tunGatewayIp}:{p.openVpn.basicStationPort}</code></li>
          <li>Vérifiez que les stats gateway sont envoyées toutes les 30 s</li>
        </ol>
      )}
    </Section>
  );
}

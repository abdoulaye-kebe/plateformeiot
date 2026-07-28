"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import { PageHeader, RoleBanner } from "@/components/ui";

type DeviceRow = {
  devEui?: string;
  name?: string;
  device?: { devEui?: string; name?: string };
};

function devEuiOf(row: DeviceRow) {
  return (row.devEui ?? row.device?.devEui ?? "").toLowerCase();
}

function nameOf(row: DeviceRow) {
  return row.name ?? row.device?.name ?? devEuiOf(row);
}

export default function CreateCustomDashboardPage() {
  const router = useRouter();
  const { write } = useClientAuth();
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ result: DeviceRow[] }>("/api/v1/lorawan/devices?limit=200").then((data) => {
      setDevices(data?.result ?? []);
    });
  }, []);

  function toggle(devEui: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(devEui)) next.delete(devEui);
      else next.add(devEui);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!write) return;
    setError("");
    if (!name.trim()) {
      setError("Nom requis");
      return;
    }
    if (selected.size === 0) {
      setError("Sélectionnez au moins un device");
      return;
    }
    setSaving(true);
    const { data, error: err } = await apiMutate<{ id: string }>("/api/v1/dashboards", "POST", {
      name: name.trim(),
      description: description.trim(),
      deviceEuis: Array.from(selected),
    });
    setSaving(false);
    if (err || !data?.id) {
      setError(err ?? "Erreur lors de la création");
      return;
    }
    router.push(`/dashboards/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-[900px] p-4 lg:p-6">
      <Link href="/" className="text-sm text-brand hover:underline">← Main dashboard</Link>
      <PageHeader
        title="Nouveau tableau de bord"
        subtitle="Visualisez les données de vos devices LoRaWAN sur un dashboard dédié"
      />
      <RoleBanner />

      {!write ? (
        <p className="text-sm text-gray-600">Mode lecture seule — connectez-vous en operator ou admin pour créer un dashboard.</p>
      ) : (
        <form onSubmit={submit} className="card-live space-y-6 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nom du dashboard</label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              placeholder="Ex. Capteurs entrepôt A"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description (optionnel)</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              rows={2}
              placeholder="Capteurs température et humidité zone nord"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Devices à inclure ({selected.size} sélectionné{selected.size > 1 ? "s" : ""})</p>
            {devices.length === 0 ? (
              <p className="text-sm text-gray-500">
                Aucun device — <Link href="/devices" className="text-brand hover:underline">ajoutez des devices</Link> d&apos;abord.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {devices.map((d) => {
                  const id = devEuiOf(d);
                  if (!id) return null;
                  const checked = selected.has(id);
                  return (
                    <li key={id}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${checked ? "bg-brand-light" : "hover:bg-gray-50"}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
                        <span className="font-medium">{nameOf(d)}</span>
                        <span className="font-mono text-xs text-gray-500">{id}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || devices.length === 0}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Création…" : "Créer le dashboard"}
            </button>
            <Link href="/" className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Annuler
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

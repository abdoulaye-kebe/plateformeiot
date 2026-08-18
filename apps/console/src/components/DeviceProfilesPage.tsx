"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/api";
import { useClientAuth } from "@/lib/useClientAuth";
import DevicesShell from "@/components/DevicesShell";
import { profileDescription, profileId, profileLabel, type ProfileRow } from "@/lib/lorawanProfiles";
import { EmptyState, PageHeader, RoleBanner, Section } from "@/components/ui";

export default function DeviceProfilesPage() {
  const { write } = useClientAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<{ result?: ProfileRow[] }>("/api/v1/lorawan/device-profiles?limit=100");
    setProfiles(data?.result ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error: err } = await apiMutate("/api/v1/lorawan/device-profiles", "POST", form);
    if (err) {
      setError(err);
      return;
    }
    setShowForm(false);
    setForm({ name: "", description: "" });
    load();
  }

  return (
    <DevicesShell>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Device profiles"
          subtitle="Profils radio LoRaWAN EU868 OTAA — région, MAC version, codec"
          action={
            write ? (
              <button
                type="button"
                onClick={() => setShowForm(!showForm)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                {showForm ? "Annuler" : "+ Nouveau profil"}
              </button>
            ) : undefined
          }
        />
        <RoleBanner />

        <p className="mb-4 text-sm text-gray-600">
          Un device profile définit la couche radio (EU868, LoRaWAN 1.0.x, OTAA, ADR). Pour attacher un{" "}
          <strong>codec JavaScript</strong>, utilisez{" "}
          <Link href="/data/decoders" className="text-brand hover:underline">
            Data → Decoders
          </Link>
          .
        </p>

        {showForm && write && (
          <form onSubmit={createProfile} className="mb-6 grid max-w-xl gap-3 rounded-xl border border-gray-200 bg-white p-6">
            <input
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Nom du profil (ex: compteur-eau-eu868)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <textarea
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Description (optionnel)"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <p className="text-xs text-gray-500">Profil par défaut : région EU868, LoRaWAN 1.0.3, OTAA, ADR activé.</p>
            <button type="submit" className="rounded-lg bg-brand py-2 text-sm font-medium text-white">
              Créer le device profile
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        )}

        <Section title={`Profils (${profiles.length})`}>
          {loading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : profiles.length === 0 ? (
            <EmptyState message="Aucun device profile — créez un profil EU868 OTAA avant d'ajouter des devices." />
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {profiles.map((p) => {
                const id = profileId(p);
                return (
                  <li key={id} className="px-4 py-3">
                    <p className="font-medium text-gray-900">{profileLabel(p)}</p>
                    {profileDescription(p) && <p className="mt-0.5 text-sm text-gray-600">{profileDescription(p)}</p>}
                    <p className="mt-1 font-mono text-xs text-gray-400">{id}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </DevicesShell>
  );
}

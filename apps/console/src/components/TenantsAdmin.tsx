"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiMutate, isPlatformAdmin } from "@/lib/api";
import { sessionUser, getSession } from "@/lib/auth";

type Tenant = { id: string; name: string; slug: string; plan: string; status?: string; chirpstackTenantId?: string };
type TenantMember = { id: string; email: string; role: string; keycloakUserId: string; createdAt: string };
type ProvisionedUser = {
  email: string;
  username: string;
  role: string;
  temporaryPassword?: string;
  inviteEmailSent?: boolean;
  inviteEmailError?: string;
  keycloakUserId: string;
};
type CreateTenantResult = Tenant & {
  provisionedUser?: ProvisionedUser;
  keycloakError?: string;
};
type AddMemberResult = { provisionedUser: ProvisionedUser };

const ROLES = [
  { value: "operator", label: "Operator (NOC)" },
  { value: "viewer", label: "Viewer (lecture seule)" },
  { value: "tenant-admin", label: "Tenant admin" },
] as const;

function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "tenant";
}

function TenantUsersPanel({ tenant, onMemberAdded }: { tenant: Tenant; onMemberAdded: () => void }) {
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [form, setForm] = useState({ email: "", password: "", role: "operator", sendInvite: false });
  const [error, setError] = useState("");
  const [created, setCreated] = useState<ProvisionedUser | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    const data = await apiFetch<{ result: TenantMember[] }>(`/api/v1/tenants/${tenant.id}/members`);
    setMembers(data?.result ?? []);
    setLoadingMembers(false);
  }, [tenant.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    const { data, error: err } = await apiMutate<AddMemberResult>(
      `/api/v1/tenants/${tenant.id}/members`,
      "POST",
      {
        email: form.email,
        password: form.password || undefined,
        role: form.role,
        sendInvite: form.sendInvite,
      },
    );
    if (err || !data?.provisionedUser) {
      setError(err ?? "Erreur provisioning");
      return;
    }
    setCreated(data.provisionedUser);
    setForm({ email: "", password: "", role: "operator", sendInvite: false });
    loadMembers();
    onMemberAdded();
  }

  if (!tenant.chirpstackTenantId) {
    return <p className="px-4 py-3 text-xs text-brand-dark">Réseau LoRaWAN non provisionné — impossible de créer des utilisateurs.</p>;
  }

  return (
    <div className="border-t border-gray-200 bg-neutral-100/50 px-4 py-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-700">Utilisateurs Keycloak</h3>
          {loadingMembers ? (
            <p className="text-xs text-gray-500">Chargement…</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-gray-500">Aucun utilisateur enregistré pour ce tenant.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                  <span className="font-mono text-xs">{m.email}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-brand">{m.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-700">Ajouter un utilisateur</h3>
          <form onSubmit={addMember} className="grid gap-2">
            <input
              className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              type="email"
              placeholder="email@client.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <select
              className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <input
              className="rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm"
              type="password"
              placeholder="Mot de passe (auto si vide)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} />
              Envoyer invitation email Keycloak (SMTP requis)
            </label>
            <button type="submit" className="rounded-lg bg-sky-700 py-2 text-sm font-medium hover:bg-sky-600">
              Créer utilisateur Keycloak
            </button>
          </form>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {created && (
            <div className="mt-3 rounded-lg border border-brand-muted bg-brand-light p-3 text-xs">
              <p className="text-brand-dark">Utilisateur créé : <span className="font-mono">{created.email}</span></p>
              <p className="text-gray-600">Rôle : {created.role}</p>
              {created.temporaryPassword && (
                <p className="mt-1 text-brand-dark">Mot de passe : <span className="font-mono">{created.temporaryPassword}</span></p>
              )}
              {!created.temporaryPassword && form.sendInvite && created.inviteEmailSent && (
                <p className="mt-1 text-brand">Invitation email envoyée — consultez Mailpit : <a href="http://localhost:8025" className="underline" target="_blank" rel="noreferrer">localhost:8025</a></p>
              )}
              {created.inviteEmailError && (
                <p className="mt-1 text-brand-dark">Utilisateur créé, mais email non envoyé : {created.inviteEmailError}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TenantsAdmin() {
  const user = sessionUser(getSession());
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    plan: "starter",
    provisionChirpstack: true,
    provisionKeycloak: true,
    adminEmail: "",
    adminPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<CreateTenantResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiFetch<{ result: Tenant[] }>("/api/v1/tenants");
    setTenants(data?.result ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!isPlatformAdmin(user?.roles ?? [])) {
    return (
      <div className="p-4 lg:p-6">
        <h1 className="text-2xl font-semibold">Tenants clients</h1>
        <p className="mt-4 text-red-600">Accès réservé au rôle platform-admin.</p>
        <p className="mt-2 text-sm text-gray-600">
          Déconnectez-vous et reconnectez-vous avec <strong className="text-gray-800">admin / admin</strong>.
        </p>
        <Link href="/" className="mt-6 inline-block text-brand hover:underline">← Retour au tableau de bord</Link>
      </div>
    );
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    const slug = slugFromName(form.name);
    if (!form.name.trim() || !slug) {
      setError("Indiquez un nom client valide");
      return;
    }
    if (!form.adminEmail.trim()) {
      setError("Indiquez l'email admin Keycloak");
      return;
    }
    const { data, error: err } = await apiMutate<CreateTenantResult>("/api/v1/tenants", "POST", {
      name: form.name.trim(),
      slug,
      plan: form.plan,
      provisionChirpstack: form.provisionChirpstack,
      provisionKeycloak: form.provisionKeycloak,
      adminEmail: form.adminEmail.trim() || undefined,
      adminPassword: form.adminPassword || undefined,
    });
    if (err || !data) {
      setError(err ?? "Erreur création");
      const slug = slugFromName(form.name);
      const existing = tenants.find((t) => t.slug === slug);
      if (existing) {
        setExpandedId(existing.id);
      }
      return;
    }
    setSuccess(data);
    setExpandedId(data.id);
    setForm({
      name: "",
      plan: "starter",
      provisionChirpstack: true,
      provisionKeycloak: true,
      adminEmail: "",
      adminPassword: "",
    });
    load();
  }

  async function toggleSuspend(t: Tenant) {
    const next = t.status === "suspended" ? "active" : "suspended";
    const { error: err } = await apiMutate(`/api/v1/tenants/${t.id}/status`, "PATCH", { status: next });
    if (err) setError(err);
    else load();
  }

  async function removeTenant(t: Tenant) {
    if (!confirm(`Supprimer le tenant « ${t.name} » ? Action irréversible.`)) return;
    const { error: err } = await apiMutate(`/api/v1/tenants/${t.id}`, "DELETE");
    if (err) setError(err);
    else load();
  }

  return (
    <div className="p-4 lg:p-6">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-brand">Administration SaaS</p>
        <h1 className="text-3xl font-semibold">Tenants clients</h1>
        <p className="mt-2 text-gray-600">
          Provisionnement réseau LoRaWAN isolé + utilisateurs Keycloak (admin, operator, viewer) avec claim{" "}
          <code className="text-brand">tenant_id</code> automatique.
        </p>
      </header>

      {success && (
        <section className="mb-6 rounded-xl border border-brand bg-brand-light p-4 text-sm">
          <p className="font-medium text-brand-dark">Tenant « {success.name} » créé</p>
          {success.provisionedUser ? (
            <dl className="mt-3 space-y-1 text-gray-800">
              <div><dt className="inline text-gray-600">Email admin : </dt><dd className="inline font-mono">{success.provisionedUser.email}</dd></div>
              <div><dt className="inline text-gray-600">Rôle : </dt><dd className="inline">{success.provisionedUser.role}</dd></div>
              {success.provisionedUser.temporaryPassword && (
                <div><dt className="inline text-gray-600">Mot de passe initial : </dt><dd className="inline font-mono text-brand-dark">{success.provisionedUser.temporaryPassword}</dd></div>
              )}
              <p className="mt-2 text-xs text-gray-600">Communiquez ces identifiants au client de façon sécurisée.</p>
            </dl>
          ) : success.keycloakError ? (
            <p className="mt-2 text-brand-dark">Keycloak : {success.keycloakError}</p>
          ) : null}
        </section>
      )}

      <section className="mb-10 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium mb-4">Nouveau tenant</h2>
        <form onSubmit={createTenant} noValidate className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">Nom client *</label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm sm:max-w-md"
              placeholder="Ex. Suez"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            {form.name.trim() && (
              <p className="mt-1 text-xs text-gray-500">
                Identifiant : <span className="font-mono text-brand/80">{slugFromName(form.name)}</span>
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Plan</label>
            <select className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="starter">Starter — 50 devices</option>
              <option value="pro">Pro — 500 devices</option>
              <option value="enterprise">Enterprise — 10 000 devices</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">Email admin Keycloak *</label>
            <input className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm" type="email" placeholder="admin@suez.com" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-gray-600">Mot de passe admin</label>
            <input className="w-full rounded-lg border border-gray-300 bg-neutral-100 px-3 py-2 text-sm sm:max-w-md" type="password" placeholder="Auto-généré si vide" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.provisionChirpstack} onChange={(e) => setForm({ ...form, provisionChirpstack: e.target.checked })} />
            Créer espace réseau LoRaWAN
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.provisionKeycloak} onChange={(e) => setForm({ ...form, provisionKeycloak: e.target.checked })} />
            Créer utilisateur Keycloak (tenant_id)
          </label>
          <button type="submit" className="sm:col-span-2 rounded-lg bg-brand py-2 font-medium hover:bg-brand-dark">Créer tenant + admin</button>
        </form>
        {error && (
          <p className="mt-3 text-sm text-red-600">
            {error}
            {tenants.some((t) => t.slug === slugFromName(form.name)) && (
              <span className="block mt-1 text-brand-dark">→ Voir le tenant existant dans la liste ci-dessous (cliquez sur ▶).</span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium mb-4">Tenants existants</h2>
        {loading ? <p className="text-gray-500">Chargement…</p> : tenants.length === 0 ? (
          <p className="text-gray-500">Aucun tenant.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {tenants.map((t) => (
              <div key={t.id}>
                <div className="flex items-center gap-2 px-2 py-3 text-sm hover:bg-white">
                  <button type="button" className="w-4 text-gray-500" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                    {expandedId === t.id ? "▼" : "▶"}
                  </button>
                  <button type="button" className="flex flex-1 items-center gap-4 text-left" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
                    <span className="flex-1 font-medium">{t.name}</span>
                    <span className="text-gray-600">{t.slug}</span>
                    <span>{t.plan}</span>
                    <span className={`text-xs ${t.status === "suspended" ? "text-amber-400" : "text-brand"}`}>{t.status ?? "active"}</span>
                  </button>
                  <button type="button" className="rounded px-2 py-1 text-xs text-brand-dark hover:bg-gray-100" onClick={() => toggleSuspend(t)}>
                    {t.status === "suspended" ? "Réactiver" : "Suspendre"}
                  </button>
                  {t.slug !== "chirpstack-default" && (
                    <button type="button" className="rounded px-2 py-1 text-xs text-red-600 hover:bg-gray-100" onClick={() => removeTenant(t)}>
                      Supprimer
                    </button>
                  )}
                </div>
                {expandedId === t.id && (
                  <TenantUsersPanel tenant={t} onMemberAdded={() => {}} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

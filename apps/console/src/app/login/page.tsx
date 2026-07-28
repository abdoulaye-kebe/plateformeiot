"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { login, saveSession } from "@/lib/auth";
import BrandLogo from "@/components/BrandLogo";
import TopBar from "@/components/TopBar";

const FEATURES = [
  "Connectivité LoRaWAN simple, évolutive et sécurisée",
  "Gestion devices, gateways et applications",
  "Analytics, NOC et détection d'anomalies",
  "Agent IA pour diagnostics et opérations",
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("operator");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await login(username, password);
      saveSession(session);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <div className="flex flex-1">
        {/* Hero noir — style Live Objects */}
        <section className="hidden w-1/2 flex-col justify-center bg-black px-12 py-16 lg:flex">
          <BrandLogo variant="dark" subtitle="Sonatel · Orange IoT" />
          <h1 className="mt-10 text-3xl font-bold leading-tight text-white">
            Connectivité IoT LoRaWAN
            <br />
            simple, évolutive et sécurisée
          </h1>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 text-brand">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Formulaire */}
        <section className="flex w-full flex-col items-center justify-center bg-neutral-100 px-6 py-12 lg:w-1/2">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <BrandLogo variant="light" subtitle="Sonatel · Orange IoT" />
            </div>

            <div className="card-live">
              <h2 className="text-2xl font-bold text-black">Connexion</h2>
              <p className="mt-2 text-sm text-gray-600">Accédez à votre portail LoRaWAN SaaS</p>

              <form onSubmit={onSubmit} className="mt-8 space-y-5">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Utilisateur</span>
                  <input className="input-field mt-1.5" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Mot de passe</span>
                  <input
                    type="password"
                    className="input-field mt-1.5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={loading} className="btn-outline w-full">
                  {loading ? "Connexion…" : "Se connecter"}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-gray-500">
                Comptes démo : admin/admin · operator/operator · viewer/viewer
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

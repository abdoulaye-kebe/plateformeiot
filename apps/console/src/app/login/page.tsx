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

const DEMO_ACCOUNTS = [
  { role: "Admin", user: "admin", pass: "admin" },
  { role: "Operator", user: "operator", pass: "operator" },
  { role: "Viewer", user: "viewer", pass: "viewer" },
];

function UserIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

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
      if (err instanceof Error && err.name === "TimeoutError") {
        setError("Keycloak injoignable — vérifiez le port 8082 et la configuration");
      } else {
        setError(err instanceof Error ? err.message : "Erreur de connexion");
      }
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(user: string, pass: string) {
    setUsername(user);
    setPassword(pass);
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <div className="flex flex-1">
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
                <span className="mt-0.5 font-bold text-brand">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex w-full flex-col justify-center bg-[#f4f4f4] px-6 py-10 lg:w-1/2 lg:px-16">
          <div className="mx-auto w-full max-w-[440px]">
            <div className="login-panel">
              <div className="login-panel-header">
                <BrandLogo variant="light" subtitle="Sonatel · Orange IoT" />
                <div className="mt-6 border-l-4 border-brand pl-4">
                  <h2 className="text-2xl font-bold text-black">Connexion</h2>
                  <p className="mt-1 text-sm text-gray-600">Portail LoRaWAN SaaS — M2M &amp; IoT</p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="login-panel-body space-y-4">
                <div className="login-field">
                  <label htmlFor="username">Utilisateur</label>
                  <div className="login-input-wrap">
                    <UserIcon />
                    <input
                      id="username"
                      className="login-input"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="Identifiant"
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label htmlFor="password">Mot de passe</label>
                  <div className="login-input-wrap">
                    <LockIcon />
                    <input
                      id="password"
                      type="password"
                      className="login-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Mot de passe"
                    />
                  </div>
                </div>

                {error && (
                  <div className="login-error" role="alert">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Connexion en cours…
                    </span>
                  ) : (
                    "Se connecter"
                  )}
                </button>
              </form>

              <div className="login-panel-footer">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Accès démo</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {DEMO_ACCOUNTS.map(({ role, user, pass }) => (
                    <button
                      key={user}
                      type="button"
                      onClick={() => fillDemo(user, pass)}
                      className="login-demo-btn"
                    >
                      <span className="block text-[10px] font-bold uppercase text-brand">{role}</span>
                      <span className="mt-1 block font-mono text-[11px] text-gray-700">{user}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-gray-500">
              © Sonatel · Orange IoT — Plateforme LoRaWAN
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

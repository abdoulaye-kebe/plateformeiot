"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold text-gray-900">Erreur d&apos;affichage</h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        {error.message || "Une exception JavaScript a interrompu le chargement de la page."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark">
          Réessayer
        </button>
        <Link href="/" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Retour au dashboard
        </Link>
        <Link href="/login" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Reconnexion
        </Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WaterMetersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[water-meters]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-lg font-semibold text-gray-900">Page compteurs — erreur d&apos;affichage</h1>
      <p className="mt-2 max-w-md text-sm text-gray-600">
        Rechargez la page (Cmd+Shift+R) si vous venez de mettre à jour la plateforme — le cache navigateur peut
        conserver d&apos;anciens fichiers JavaScript.
      </p>
      <p className="mt-2 font-mono text-xs text-red-600">{error.message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Recharger (hard refresh)
        </button>
        <Link href="/apps" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          Retour apps
        </Link>
      </div>
    </div>
  );
}

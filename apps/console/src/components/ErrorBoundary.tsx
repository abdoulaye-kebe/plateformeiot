"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  label?: string;
};

type State = { error: Error | null };

/** Isole une section — évite l'écran blanc Next.js sur toute la page. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">{this.props.label ?? "Section"} — erreur d&apos;affichage</p>
          <p className="mt-2 text-xs text-red-700">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-red-300 px-3 py-1.5 text-xs hover:bg-red-100"
            onClick={() => this.setState({ error: null })}
          >
            Réessayer
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

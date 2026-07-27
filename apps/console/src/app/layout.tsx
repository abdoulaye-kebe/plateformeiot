import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lorawan Platform",
  description: "Console IoT LoRaWAN SaaS — gestion réseau, analytics et IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

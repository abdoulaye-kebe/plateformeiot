import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LoRaWAN SaaS — Orange Live Objects",
  description: "Portail IoT LoRaWAN Sonatel · Orange — devices, analytics, NOC et IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

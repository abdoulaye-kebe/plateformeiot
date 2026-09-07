import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orange IoT Platform — LoRaWAN · MQTT · LwM2M",
  description: "Portail IoT multiprotocole Sonatel · Orange — LoRaWAN, LTE-M, MQTT, LwM2M",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

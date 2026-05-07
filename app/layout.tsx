import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABYSS: KHAOS DESCENT",
  description: "Desciende del Piso 100 al Piso 1. Un RPG forjado en el abismo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#06070C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-abyss-void text-white antialiased">{children}</body>
    </html>
  );
}

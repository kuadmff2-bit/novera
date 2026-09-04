import type { Metadata } from "next";
import "./globals.css";
import "./novera-city.css";

export const metadata: Metadata = {
  title: "Novera — FPS de sobrevivência",
  description: "Entre em uma pequena cidade tática, use elevações, pule, mire e sobreviva às ondas em Novera.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

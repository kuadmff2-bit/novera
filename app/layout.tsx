import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Novera — FPS de sobrevivência",
  description: "Entre na arena, enfrente ondas de sentinelas e estabeleça seu recorde em Novera.",
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

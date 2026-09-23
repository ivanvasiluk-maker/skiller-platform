import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaInstall } from "./pwa-install";

export const metadata: Metadata = {
  title: "SKILLER — личный протокол навыков",
  description: "Персональная система освоения психологических навыков на основе реальных применений.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SKILLER",
  },
};

export const viewport: Viewport = {
  themeColor: "#173e37",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}

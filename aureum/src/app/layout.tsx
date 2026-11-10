import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell";

export const metadata: Metadata = {
  title: { default: "Aureum", template: "%s · Aureum" },
  description: "Vermögensverwaltung für Immobilienbestände: Finanzierung, Cashflow, Kennzahlen, Fristen und Berichte.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0a08" },
    { media: "(prefers-color-scheme: light)", color: "#f5f2ea" },
  ],
};

// Setzt Farbschema, Akzent und Dichte vor dem ersten Zeichnen, damit nichts aufblitzt.
const boot = `try{var u=JSON.parse(localStorage.getItem("aureum:ui")||"{}"),d=document.documentElement,t=u.theme||"system";d.dataset.theme=t==="dunkel"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";d.dataset.accent=u.accent||"gold";d.dataset.density=u.density||"komfortabel"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

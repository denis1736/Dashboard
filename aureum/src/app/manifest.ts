import type { MetadataRoute } from "next";

/** Ermöglicht „Zum Home-Bildschirm hinzufügen“ mit eigenem Symbol und ohne Browserleiste. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aureum",
    short_name: "Aureum",
    description: "Vermögensverwaltung für Immobilienbestände",
    lang: "de",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a08",
    theme_color: "#0b0a08",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

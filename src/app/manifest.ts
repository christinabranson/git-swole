import type { MetadataRoute } from "next";

/**
 * Makes the app installable: "Add to Home Screen" on iOS, "Install app" on
 * Android/desktop Chrome. Opens standalone, without browser chrome.
 *
 * Colours are the handoff's `--bg` (#0b0e10); the icons' padding is the logo
 * tile's own colour so the OS corner mask has nothing to clip.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Git Swole",
    short_name: "Git Swole",
    description: "Linear-progression barbell tracker",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0e10",
    theme_color: "#0b0e10",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

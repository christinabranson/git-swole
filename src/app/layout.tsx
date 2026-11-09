import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";
import { AppShell } from "@/components/app-shell";

// Numbers are Anton, words are Plex Mono. See the handoff type scale.
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Git Swole",
  description: "Linear-progression barbell tracker",
  applicationName: "Git Swole",
  icons: {
    icon: "/gitswole.png",
    apple: "/icons/apple-touch-icon.png",
  },
  // iOS ignores the manifest's display mode; this is what makes "Add to Home
  // Screen" open standalone. "black" keeps content below the status bar.
  appleWebApp: {
    capable: true,
    title: "Git Swole",
    statusBarStyle: "black",
  },
};

// `cover` lets the page reach under the iPhone home indicator; the mobile tab bar
// pads itself by env(safe-area-inset-bottom) so its labels stay clear of it.
export const viewport: Viewport = {
  themeColor: "#0b0e10",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${anton.variable} ${plexMono.variable}`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

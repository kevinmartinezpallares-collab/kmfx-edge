import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "@/components/app/providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const vercelTelemetryEnabled = process.env.KMFX_ENABLE_VERCEL_TELEMETRY === "1";

const themeBootScript = `
(() => {
  try {
    const pathname = window.location.pathname;
    const authRouteUsesDarkTheme = pathname === "/login" || pathname.startsWith("/auth/");
    const stored = authRouteUsesDarkTheme ? "dark" : window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = stored === "light" ? "light" : stored === "system" ? (prefersDark ? "dark" : "light") : "dark";
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export const metadata: Metadata = {
  title: "KMFX Edge",
  description: "Panel operativo para trading, riesgo, cuentas y portfolio.",
  applicationName: "KMFX Edge",
  other: {
    google: "notranslate",
  },
  appleWebApp: {
    capable: true,
    title: "KMFX Edge",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/brand/kmfx-edge/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/kmfx-edge/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/kmfx-edge/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/brand/kmfx-edge/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1a1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      translate="no"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full`}
      data-theme="dark"
    >
      <head>
        <link rel="preconnect" href="https://challenges.cloudflare.com" />
        <link rel="dns-prefetch" href="https://challenges.cloudflare.com" />
        <script
          async
          defer
          id="kmfx-turnstile-script"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
        {vercelTelemetryEnabled ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}

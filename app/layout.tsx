import type { Metadata } from "next";
import localFont from "next/font/local";
import { config } from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { WorkspaceShell } from "./workspace-shell";

config.autoAddCss = false;

// Geist and Geist Mono are self-hosted for the same reason as the Urdu font below: next/font/google
// downloads them at build time, which fails on machines that are offline or behind a proxy.
// Both are variable-weight files, so the 100-900 range is valid here.
const geistSans = localFont({
  variable: "--font-geist-sans",
  src: "./fonts/Geist-Variable.woff2",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  src: "./fonts/GeistMono-Variable.woff2",
  weight: "100 900",
  display: "swap",
});

// Self-hosted instead of next/font/google: dev machines behind a proxy/offline network
// can't reach fonts.googleapis.com at build time, which previously threw a fetch warning
// and silently fell back to a system font. Google serves the same static file for both
// weight 400 and 700 for this font (it isn't a variable font), so a single fixed weight
// here is correct — a "400 700" range is only valid for an actual variable-weight file
// and made Turbopack's font-fallback resolution fail outright.
const notoNastaliqUrdu = localFont({
  variable: "--font-urdu",
  src: "./fonts/NotoNastaliqUrdu-Regular.woff2",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Al Qamar Hospital",
  description: "Clinic operations and cash management workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${notoNastaliqUrdu.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers><WorkspaceShell>{children}</WorkspaceShell></Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time and serves them from this origin:
// no runtime request to Google, in line with the privacy promise.
const ui = Schibsted_Grotesk({ variable: "--font-ui", subsets: ["latin"] });
const code = Spline_Sans_Mono({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Packetman",
  description: "API client berbasis web yang mengutamakan privasi. Data request kamu tetap di perangkatmu.",
};

export const viewport: Viewport = {
  themeColor: "#0f1628",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-theme="dark" className={`${ui.variable} ${code.variable} h-full`} suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}

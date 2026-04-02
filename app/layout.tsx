import React from "react";
import type { Metadata, Viewport } from "next";
import { Fredoka, JetBrains_Mono, Cal_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { UnitProvider } from "@/components/unit-provider";

// Display / headline font — bubbly, bold (Adore Cats fallback)
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const calSans = Cal_Sans({
  subsets: ["latin"],
  variable: "--font-headline",
  display: "swap",
  weight: "400"
});

export const metadata: Metadata = {
  title: "CrowdRoast - Green Coffee Marketplace",
  description:
    "B2B marketplace connecting specialty coffee sellers with roasters through commitment-based group buying.",
};

export const viewport: Viewport = {
  themeColor: "#E8442A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body
        suppressHydrationWarning
        className={`${fredoka.variable} ${jetbrainsMono.variable} ${calSans.variable} font-sans antialiased`}
      >
        <UnitProvider>
          {children}
          <Toaster richColors position="top-right" />
        </UnitProvider>
      </body>
    </html>
  );
}

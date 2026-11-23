import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import MerenjeBrzine from "@/components/MerenjeBrzine";
import { cookies } from "next/headers";
import { VELICINA_SLOVA_COOKIE, velicinaSlova } from "@/lib/velicina-slova";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteName = "Dina Kalendar";
const siteDescription = "Jednostavno zakazivanje časova za instruktore i učenike. Pregled termina, zahtevi za čas i upravljanje klijentima u jednom mestu.";
const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dina-kalendar.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: ["zakazivanje časova", "instruktor", "učenik", "termini", "kalendar", "obrazovanje"],
  authors: [{ name: "Dina Kalendar" }],
  creator: "Dina Kalendar",
  openGraph: {
    type: "website",
    locale: "sr_RS",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: { canonical: siteUrl },
  formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fef9e7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Veličina slova izabrana u Podešavanjima (kolačić, po uređaju) – vidi globals.css (--skala).
  const velicina = velicinaSlova((await cookies()).get(VELICINA_SLOVA_COOKIE)?.value);
  return (
    <html
      lang="sr"
      suppressHydrationWarning
      data-velicina={velicina.kljuc}
      style={{ ["--skala" as string]: String(velicina.skala) }}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 5000 }} />
        {/* Vreme učitavanja stranica i trajanje operacija → Vercel Logs („[merenje]“). */}
        <MerenjeBrzine />
      </body>
    </html>
  );
}

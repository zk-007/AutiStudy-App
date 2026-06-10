import type { Metadata } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { SmoothScrollProvider } from "@/components/primitives/SmoothScrollProvider";
import { Aurora } from "@/components/primitives/Aurora";
import { SettingsProvider } from "@/lib/settings/SettingsContext";
import { SettingsModal } from "@/components/settings/SettingsModal";

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutiStudy — Adaptive learning for every mind",
  description:
    "An inductive learning AI platform crafted for autistic students in grades 4–7. Calm, adaptive, multimodal.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${quicksand.variable} ${inter.variable}`}>
      <body className="antialiased">
        <LocaleProvider>
          <SettingsProvider>
            <AuthProvider>
              <SmoothScrollProvider>
                <Aurora />
                {children}
                <SettingsModal />
              </SmoothScrollProvider>
            </AuthProvider>
          </SettingsProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

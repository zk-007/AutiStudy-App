import type { Metadata } from "next";
import { Quicksand, Inter } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { RoutePersistence } from "@/components/auth/RoutePersistence";
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
    <html lang="en" className={`${quicksand.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply saved theme before paint to avoid a light→dark flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("autistudy_theme");if(t!=="dark"&&t!=="light"){var k="autistudy_settings_guest";try{var s=localStorage.getItem("autistudy_session");if(s){var u=JSON.parse(s).user;if(u&&u.email)k="autistudy_settings_"+String(u.email).toLowerCase();}}catch(ex){}var raw=localStorage.getItem(k)||localStorage.getItem("autistudy_settings_guest");if(raw)t=JSON.parse(raw).theme;}if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <LocaleProvider>
          <AuthProvider>
            <SettingsProvider>
              <RoutePersistence />
              <SmoothScrollProvider>
                <Aurora />
                {children}
                <SettingsModal />
              </SmoothScrollProvider>
            </SettingsProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

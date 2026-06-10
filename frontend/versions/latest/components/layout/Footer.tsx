"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Heart } from "lucide-react";

export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="relative mt-20 border-t border-glacier-200/60 bg-white/40 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6 py-10 text-center">
        <div className="flex items-center justify-center gap-2 text-deep-soft">
          <span className="text-sm">{t.footer.tagline}</span>
          <Heart size={14} className="text-glacier-500 fill-glacier-300" />
        </div>
        <p className="mt-3 text-xs text-deep-muted">{t.footer.copy}</p>
      </div>
    </footer>
  );
}

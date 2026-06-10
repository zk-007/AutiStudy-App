"use client";

import { PageShell } from "@/components/layout/PageShell";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function AboutPage() {
  const { t } = useLocale();
  return (
    <PageShell title={t.pages.about.title}>
      <div className="rounded-3xl glass-strong p-8 md:p-12 shadow-soft">
        <p className="text-lg leading-relaxed text-deep-soft text-balance">
          {t.pages.about.body}
        </p>
      </div>
    </PageShell>
  );
}

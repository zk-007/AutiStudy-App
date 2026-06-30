"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

export function ChatInstructionBanner() {
  const { locale } = useLocale();
  const isUr = locale === "ur";

  return (
    <div className="mx-4 md:mx-6 mt-3 mb-1 rounded-2xl border border-violet-200/80 bg-gradient-to-r from-violet-50/90 to-purple-50/90 px-4 py-3 text-center shadow-sm">
      <p className="text-sm font-bold text-deep">
        {isUr ? (
          <>
            اگر سمجھ آ جائے تو <span className="text-emerald-600">👍</span> دبائیں — نہ آئے تو{" "}
            <span className="text-orange-600">👎</span>
          </>
        ) : (
          <>
            Tap <span className="text-emerald-600">👍</span> if you understand —{" "}
            <span className="text-orange-600">👎</span> if not
          </>
        )}
      </p>
    </div>
  );
}

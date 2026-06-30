"use client";

import { useRouter } from "next/navigation";
import { LearningPreferenceWizard } from "@/components/child-led/LearningPreferenceWizard";
import { childLedApi } from "@/lib/api/client";
import type { Modality } from "@/lib/agent/childLedTypes";
import { resolveReturnUrl } from "@/lib/auth/redirect";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function OnboardingInner() {
  const router = useRouter();
  const search = useSearchParams();
  const nextUrl = resolveReturnUrl(search?.get("next"));

  const onComplete = async (order: Modality[]) => {
    await childLedApi.savePreferences(order);
    router.replace(nextUrl);
  };

  return <LearningPreferenceWizard onComplete={onComplete} />;
}

export default function LearningStyleOnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center">Loading…</main>}>
      <OnboardingInner />
    </Suspense>
  );
}

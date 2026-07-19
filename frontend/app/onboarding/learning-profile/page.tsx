"use client";

/**
 * One-time Learner Profile onboarding (Gap #2: Persistent Learner Profile).
 *
 * Shown once, right after a student's account is created (or on first login
 * for existing accounts that never answered these questions). The answers
 * are saved permanently on the backend (utils/agent_memory.save_learner_profile)
 * and become part of what the Media Agent reads before every teaching
 * decision — so the student never has to repeat "I prefer visual explanations"
 * in chat again.
 */

import { FormEvent, ReactNode, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, Ear, FileText, Shapes, Sparkles } from "lucide-react";
import { NavBar } from "@/components/layout/NavBar";
import { Footer } from "@/components/layout/Footer";
import { DancingButton } from "@/components/primitives/DancingButton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { loginUrlFor, resolveReturnUrl, clearReturnUrl } from "@/lib/auth/redirect";
import { profileApi, ApiError } from "@/lib/api/client";

export default function LearningProfileOnboardingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen flex items-center justify-center text-deep-soft">Loading…</main>}>
      <OnboardingInner />
    </Suspense>
  );
}

type LearningStyle = "visual" | "audio" | "text" | "mixed";
type Language = "en" | "ur";
type AudioPref = "auto" | "manual";
type SensoryPref = "calm" | "standard";
type ExplanationStyle = "step_by_step" | "concise";

function OnboardingInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const nextUrl = resolveReturnUrl(search?.get("next"));

  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [learningStyle, setLearningStyle] = useState<LearningStyle>("mixed");
  const [language, setLanguage] = useState<Language>("en");
  const [audioPref, setAudioPref] = useState<AudioPref>("manual");
  const [sensoryPref, setSensoryPref] = useState<SensoryPref>("standard");
  const [explanationStyle, setExplanationStyle] = useState<ExplanationStyle>("step_by_step");

  // Route guard + skip if already onboarded (never show this twice).
  // Retries on transient network/server errors — a failed check must NOT
  // fall back to showing the form, or a student who already onboarded
  // could accidentally overwrite their saved preference.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(loginUrlFor("/onboarding/learning-profile"));
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        try {
          const profile = await profileApi.get();
          if (cancelled) return;
          if (profile.onboarding_completed) {
            router.replace(nextUrl);
            return;
          }
          // Confirmed: genuinely not onboarded yet — show the form.
          setChecking(false);
          return;
        } catch {
          if (attempt < 2) await sleep(500 * (attempt + 1));
        }
      }
      // Could not confirm onboarding status after retries — safer to
      // continue into the app than to risk re-showing/resetting an
      // already-saved preference.
      if (!cancelled) router.replace(nextUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, nextUrl, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await profileApi.save({
        learning_style: learningStyle,
        preferred_language: language,
        audio_preference: audioPref,
        sensory_preference: sensoryPref,
        explanation_style: explanationStyle,
      });
      clearReturnUrl();
      router.push(nextUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not save your preferences. Please try again.");
      setSubmitting(false);
    }
  };

  if (authLoading || checking) {
    return <main className="min-h-screen flex items-center justify-center text-deep-soft">Loading…</main>;
  }

  return (
    <main className="relative min-h-screen flex flex-col">
      <NavBar />
      <div className="flex-1 flex items-center justify-center px-6 pt-32 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-lg"
        >
          <div className="rounded-3xl glass-strong p-8 md:p-10 shadow-deep">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🌟</span>
              <h1 className="font-display text-2xl font-extrabold text-deep leading-tight">
                {user?.name ? `Hi ${user.name}! Let's set up your learning style` : "Let's set up your learning style"}
              </h1>
            </div>
            <p className="text-sm text-deep-soft mb-7">
              Answer these once — AutiStudy will remember your preferences and use them every time you learn,
              so you never have to repeat yourself.
            </p>

            <form className="space-y-6" onSubmit={onSubmit} noValidate>
              <ChoiceGroup
                label="How do you like to learn best?"
                icon={<Eye size={16} />}
                value={learningStyle}
                onChange={setLearningStyle}
                options={[
                  { value: "visual", label: "🖼️ Pictures" },
                  { value: "audio", label: "🔊 Listening" },
                  { value: "text", label: "📝 Reading" },
                  { value: "mixed", label: "✨ A mix" },
                ]}
              />

              <ChoiceGroup
                label="Which language do you prefer?"
                icon={<FileText size={16} />}
                value={language}
                onChange={setLanguage}
                options={[
                  { value: "en", label: "English" },
                  { value: "ur", label: "اردو (Urdu)" },
                ]}
              />

              <ChoiceGroup
                label="How should answers be read aloud?"
                icon={<Ear size={16} />}
                value={audioPref}
                onChange={setAudioPref}
                options={[
                  { value: "manual", label: "🖱️ I'll press play myself" },
                  { value: "auto", label: "▶️ Start automatically" },
                ]}
              />

              <ChoiceGroup
                label="How do you feel about movement and animation?"
                icon={<Shapes size={16} />}
                value={sensoryPref}
                onChange={setSensoryPref}
                options={[
                  { value: "standard", label: "🎬 I'm fine with animations" },
                  { value: "calm", label: "🍃 Keep things calm & still" },
                ]}
              />

              <ChoiceGroup
                label="How should explanations be given?"
                icon={<Sparkles size={16} />}
                value={explanationStyle}
                onChange={setExplanationStyle}
                options={[
                  { value: "step_by_step", label: "🪜 Small steps" },
                  { value: "concise", label: "⚡ Short & to the point" },
                ]}
              />

              {error && (
                <div className="rounded-2xl bg-rose-50/80 border border-rose-200/60 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <DancingButton
                type="submit"
                variant="primary"
                fullWidth
                disabled={submitting}
                className={submitting ? "opacity-80 cursor-wait" : ""}
              >
                {submitting ? "Saving…" : "Save & start learning"}
              </DancingButton>
            </form>
          </div>
        </motion.div>
      </div>
      <Footer />
    </main>
  );
}

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

function ChoiceGroup<T extends string>({
  label,
  icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: ChoiceOption<T>[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 px-1 text-sm font-bold text-deep-soft">
        {icon}
        <span>{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-2xl py-3 px-3 text-sm font-bold transition-all border-2 ${
                selected
                  ? "bg-glacier-500 text-white border-glacier-500 shadow-soft scale-[1.02]"
                  : "bg-white/70 text-deep border-glacier-200/60 hover:border-glacier-400 hover:bg-white"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

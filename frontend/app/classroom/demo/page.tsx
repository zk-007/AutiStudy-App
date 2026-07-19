"use client";

/**
 * Step 1 verification page — isolated from main /classroom lesson flow.
 * Test Inka-style slide engine here before wiring LLM.
 *
 * URL: http://localhost:3000/classroom/demo
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { SlideDeck } from "@/components/classroom/SlideDeck";
import { DEMO_OPTIONS } from "@/lib/classroom/demoSlides";
import type { SlideDeckPlan } from "@/lib/classroom/slideTypes";

export default function ClassroomDemoPage() {
  const [selectedId, setSelectedId] = useState<string>(DEMO_OPTIONS[0].id);
  const [slideIndex, setSlideIndex] = useState(0);
  const [playKey, setPlayKey] = useState(0);

  const selected = DEMO_OPTIONS.find((d) => d.id === selectedId) ?? DEMO_OPTIONS[0];
  const plan: SlideDeckPlan = selected.plan;
  const currentSlide = plan.slides[slideIndex];
  const totalSlides = plan.slides.length;

  const replay = useCallback(() => {
    setPlayKey((k) => k + 1);
  }, []);

  const onSlideComplete = useCallback(() => {
    if (slideIndex < totalSlides - 1) {
      setTimeout(() => {
        setSlideIndex((i) => i + 1);
        setPlayKey((k) => k + 1);
      }, 800);
    }
  }, [slideIndex, totalSlides]);

  const changeDemo = (id: string) => {
    setSelectedId(id);
    setSlideIndex(0);
    setPlayKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <header className="border-b border-white/10 px-4 py-4 md:px-8">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <Link
            href="/classroom"
            className="flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to classroom
          </Link>
          <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200">
            Step 1 — Slide Engine Demo
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 md:px-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-emerald-50">Inka-style slide engine (beta)</h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Yeh alag test page hai. Purana classroom abhi touch nahi hua. Pehle yahan
            verify karo ke bars aur flow diagrams sahi draw hotay hain — stars nahi.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {DEMO_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => changeDemo(opt.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                selectedId === opt.id
                  ? "bg-emerald-600 text-white"
                  : "bg-white/10 text-slate-300 hover:bg-white/15"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Question</p>
          <p className="text-lg text-emerald-100">{plan.question}</p>
          {currentSlide.say && (
            <p className="text-sm text-slate-400 italic">&ldquo;{currentSlide.say}&rdquo;</p>
          )}
        </div>

        <SlideDeck
          key={`${selectedId}-${slideIndex}-${playKey}`}
          slide={currentSlide}
          playing
          onComplete={onSlideComplete}
        />

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-slate-400">
            Slide {slideIndex + 1} / {totalSlides}
          </p>
          <button
            type="button"
            onClick={() => {
              setSlideIndex(0);
              replay();
            }}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            <RotateCcw className="h-4 w-4" />
            Replay from start
          </button>
          <button
            type="button"
            onClick={replay}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500"
          >
            <Play className="h-4 w-4" />
            Replay this slide
          </button>
        </div>

        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
          <h2 className="font-semibold text-amber-200">Aap ko kya check karna hai (Step 1)</h2>
          <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
            <li>
              <strong>2 + 5</strong> — teen bars (2, 5, 7) stroke-by-stroke draw hon; stars nahi
            </li>
            <li>
              <strong>Earth layers</strong> — Crust → Mantle → Core boxes with arrows; stars nahi
            </li>
            <li>
              <strong>2 slides</strong> — pehla career ladder, phir auto next slide (3+4 bars)
            </li>
          </ul>
          <p className="text-sm text-slate-400">
            Jab yeh theek lage, mujhe batao — phir Step 2: backend ko yeh draw-op format bhejwana.
          </p>
        </section>
      </main>
    </div>
  );
}

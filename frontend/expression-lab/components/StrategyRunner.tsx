"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Camera, CameraOff, ArrowLeft, Layers } from "lucide-react";
import { EMOTION_META, STRATEGIES } from "../emotions";
import { EmotionDashboard } from "./EmotionDashboard";
import { useLabCamera } from "../hooks/useLabCamera";
import { useStrategyMediapipe } from "../hooks/useStrategyMediapipe";
import { useStrategyFaceApi } from "../hooks/useStrategyFaceApi";
import { useStrategyHybrid } from "../hooks/useStrategyHybrid";
import type { StrategyId } from "../types";

interface StrategyRunnerProps {
  strategyId: StrategyId;
}

export function StrategyRunner({ strategyId }: StrategyRunnerProps) {
  const info = STRATEGIES[strategyId];
  const { videoRef, enabled, error, start, stop } = useLabCamera();

  const mp = useStrategyMediapipe(videoRef, enabled && strategyId === "mediapipe");
  const fa = useStrategyFaceApi(videoRef, enabled && strategyId === "faceapi");
  const hy = useStrategyHybrid(videoRef, enabled && strategyId === "hybrid");

  const active =
    strategyId === "mediapipe" ? mp : strategyId === "faceapi" ? fa : hy;

  useEffect(() => {
    start();
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-violet-50/20">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/expression-lab"
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display font-bold text-lg text-deep">{info.shortName}</h1>
              <p className="text-xs text-slate-500">{info.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/expression-lab/compare"
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-violet-100 text-violet-800 hover:bg-violet-200"
            >
              <Layers size={16} /> Compare all
            </Link>
            <button
              type="button"
              onClick={enabled ? stop : start}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-deep text-white hover:opacity-90"
            >
              {enabled ? <CameraOff size={16} /> : <Camera size={16} />}
              {enabled ? "Stop" : "Start"} camera
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3] shadow-lg ring-2 ring-white">
            <video
              ref={videoRef}
              className="w-full h-full object-cover scale-x-[-1]"
              playsInline
              muted
            />
            {active.result?.facePresent && (
              <div className="absolute bottom-3 left-3 right-3 flex justify-center">
                <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-sm font-medium backdrop-blur-sm">
                  {EMOTION_META[active.result.dominant].emoji}{" "}
                  {EMOTION_META[active.result.dominant].label}{" "}
                  {Math.round(active.result.confidence * 100)}%
                </span>
              </div>
            )}
            {(active.loading || !active.ready) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-sm">
                Loading models…
              </div>
            )}
          </div>
          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-xl px-4 py-2">{error}</p>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white/80 border border-white shadow-sm p-5">
            <h2 className="font-semibold text-deep mb-3">Live probabilities</h2>
            <EmotionDashboard result={active.result} fps={active.fps} />
          </section>

          <section className="rounded-2xl bg-white/60 border border-slate-100 p-5 text-sm text-slate-600 space-y-3">
            <p>{info.description}</p>
            <div>
              <p className="font-medium text-emerald-700 mb-1">Strengths</p>
              <ul className="list-disc list-inside space-y-0.5">
                {info.pros.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-amber-700 mb-1">Limitations</p>
              <ul className="list-disc list-inside space-y-0.5">
                {info.cons.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

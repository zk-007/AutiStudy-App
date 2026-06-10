"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Camera, CameraOff } from "lucide-react";
import { STRATEGIES } from "../emotions";
import { EmotionDashboard } from "./EmotionDashboard";
import { useLabCamera } from "../hooks/useLabCamera";
import { useStrategyMediapipe } from "../hooks/useStrategyMediapipe";
import { useStrategyFaceApi } from "../hooks/useStrategyFaceApi";
import { useStrategyHybrid } from "../hooks/useStrategyHybrid";

export function CompareView() {
  const { videoRef, enabled, error, start, stop } = useLabCamera();
  const mp = useStrategyMediapipe(videoRef, enabled);
  const fa = useStrategyFaceApi(videoRef, enabled);
  const hy = useStrategyHybrid(videoRef, enabled);

  useEffect(() => {
    start();
    return () => stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    { id: "mediapipe" as const, hook: mp, href: "/expression-lab/mediapipe" },
    { id: "faceapi" as const, hook: fa, href: "/expression-lab/faceapi" },
    { id: "hybrid" as const, hook: hy, href: "/expression-lab/hybrid" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-emerald-50/20">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/expression-lab" className="p-2 rounded-xl hover:bg-slate-100">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="font-display font-bold text-lg">Compare all 3 strategies</h1>
              <p className="text-xs text-slate-500">One webcam · three pipelines side by side</p>
            </div>
          </div>
          <button
            type="button"
            onClick={enabled ? stop : start}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-deep text-white"
          >
            {enabled ? <CameraOff size={16} /> : <Camera size={16} />}
            {enabled ? "Stop" : "Start"} camera
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video max-h-[280px] shadow-lg mx-auto max-w-2xl">
          <video
            ref={videoRef}
            className="w-full h-full object-cover scale-x-[-1]"
            playsInline
            muted
          />
        </div>
        {error && (
          <p className="text-center text-sm text-rose-600">{error}</p>
        )}

        <div className="grid lg:grid-cols-3 gap-4">
          {columns.map(({ id, hook, href }) => {
            const info = STRATEGIES[id];
            return (
              <div
                key={id}
                className="rounded-2xl bg-white/90 border border-white shadow-sm p-4 flex flex-col"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-deep">{info.shortName}</h2>
                    <p className="text-[10px] text-slate-400 uppercase">Strategy {id === "mediapipe" ? "A" : id === "faceapi" ? "B" : "C"}</p>
                  </div>
                  <Link
                    href={href}
                    className="text-xs text-violet-600 hover:underline"
                  >
                    Full page →
                  </Link>
                </div>
                <EmotionDashboard result={hook.result} fps={hook.fps} compact />
                {hook.loading && (
                  <p className="text-xs text-slate-400 mt-2">Loading…</p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-slate-500 max-w-xl mx-auto">
          Try the same expressions on each column: smile, frown, look away, yawn, furrow brows.
          Note which strategy feels most accurate and stable — then tell us A, B, or C.
        </p>
      </main>
    </div>
  );
}

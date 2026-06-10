"use client";

import Link from "next/link";
import { FlaskConical, Layers, ChevronRight } from "lucide-react";
import { STRATEGIES } from "@/expression-lab/emotions";
import { LAB_EMOTIONS } from "@/expression-lab/types";
import { EMOTION_META } from "@/expression-lab/emotions";

const ROUTES = [
  { href: "/expression-lab/compare", label: "Compare all 3", highlight: true, icon: Layers },
  { href: "/expression-lab/mediapipe", label: "Strategy A — MediaPipe", id: "mediapipe" as const },
  { href: "/expression-lab/faceapi", label: "Strategy B — face-api.js", id: "faceapi" as const },
  { href: "/expression-lab/hybrid", label: "Strategy C — Hybrid", id: "hybrid" as const },
];

export default function ExpressionLabHubPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-violet-50/30">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="text-violet-600" size={32} />
          <h1 className="font-display text-3xl font-extrabold text-deep">Expression Lab</h1>
        </div>
        <p className="text-slate-600 mb-8 leading-relaxed">
          Benchmark three real-time facial expression strategies before integrating the winner
          into the Media Agent. All processing runs in your browser — nothing is uploaded.
        </p>

        <div className="flex flex-wrap gap-2 mb-10">
          {LAB_EMOTIONS.map((e) => (
            <span
              key={e}
              className="text-sm px-3 py-1 rounded-full bg-white border border-slate-200 shadow-sm"
            >
              {EMOTION_META[e].emoji} {EMOTION_META[e].label}
            </span>
          ))}
        </div>

        <div className="space-y-3">
          {ROUTES.map((r) => {
            const Icon = "icon" in r ? r.icon : undefined;
            const info = "id" in r ? STRATEGIES[r.id] : null;
            return (
              <Link
                key={r.href}
                href={r.href}
                className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-4 border transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  r.highlight
                    ? "bg-violet-600 text-white border-violet-700"
                    : "bg-white/90 border-white text-deep"
                }`}
              >
                <div>
                  <p className="font-semibold flex items-center gap-2">
                    {Icon && <Icon size={18} />}
                    {r.label}
                  </p>
                  {info && (
                    <p className={`text-xs mt-0.5 ${r.highlight ? "text-violet-100" : "text-slate-500"}`}>
                      {info.description.slice(0, 80)}…
                    </p>
                  )}
                  {r.highlight && (
                    <p className="text-xs mt-1 text-violet-100">Recommended starting point</p>
                  )}
                </div>
                <ChevronRight size={20} className={r.highlight ? "text-violet-200" : "text-slate-400"} />
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-slate-500 text-center">
          Run <code className="bg-slate-100 px-1 rounded">npm run dev</code> then open these URLs.
          <br />
          Pick A, B, or C — we will wire only your choice into the tutor later.
        </p>

        <p className="mt-4 text-center">
          <Link href="/chat" className="text-sm text-violet-600 hover:underline">
            ← Back to chat
          </Link>
        </p>
      </div>
    </div>
  );
}

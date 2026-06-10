"use client";

import { motion } from "framer-motion";
import { EMOTION_META } from "../emotions";
import type { LabEmotionScores } from "../types";
import { LAB_EMOTIONS } from "../types";

interface EmotionDashboardProps {
  result: LabEmotionScores | null;
  fps?: number;
  compact?: boolean;
}

export function EmotionDashboard({ result, fps, compact }: EmotionDashboardProps) {
  if (!result) {
    return (
      <div className="text-sm text-slate-500 py-4 text-center">
        Waiting for camera…
      </div>
    );
  }

  if (!result.facePresent) {
    return (
      <div className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3 text-center">
        No face detected — position yourself in frame
      </div>
    );
  }

  const dominantMeta = EMOTION_META[result.dominant];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Dominant</p>
          <p className={`text-xl font-bold ${dominantMeta.color}`}>
            {dominantMeta.emoji} {dominantMeta.label}
            <span className="text-sm font-normal text-slate-500 ml-2">
              {Math.round(result.confidence * 100)}%
            </span>
          </p>
        </div>
        {fps !== undefined && (
          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
            {fps} fps
          </span>
        )}
      </div>

      <div className={`space-y-1.5 ${compact ? "max-h-48 overflow-y-auto" : ""}`}>
        {LAB_EMOTIONS.map((key) => {
          const pct = Math.round((result.scores[key] ?? 0) * 100);
          if (pct < 4 && key !== result.dominant) return null;
          const meta = EMOTION_META[key];
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>{meta.emoji} {meta.label}</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${meta.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.25 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

/**
 * AdaptiveAgentPanel — Real-time engagement display
 * ==================================================
 * Shows:
 *   • Live webcam + fps
 *   • Engagement PROBABILITY bars (not scary binary labels)
 *   • Current tutor action + escalation level
 *   • "AI is adapting lesson" friendly message
 *
 * DESIGN: Never show "you look confused". Show supportive messages.
 */

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, ChevronDown, ChevronUp, Zap } from "lucide-react";
import type { AdaptiveTutorState, PolicyResult, EngagementProbabilities } from "@/lib/hooks/useAdaptiveTutorAgent";
import { TUTOR_ACTION_EMOJI, TUTOR_ACTION_LABEL, TUTOR_ACTION_MESSAGE } from "@/lib/agent/types";
import { EMOTION_META } from "@/expression-lab/emotions";
import type { LabEmotion } from "@/expression-lab/types";
import { LAB_EMOTIONS } from "@/expression-lab/types";

/** Static Tailwind classes — must live in a scanned file so JIT includes every bar color. */
const EMOTION_BAR_CLASS: Record<LabEmotion, string> = {
  happy: "bg-emerald-500",
  sad: "bg-indigo-500",
  frustrated: "bg-rose-500",
  bored: "bg-slate-400",
  tired: "bg-violet-500",
  inattentive: "bg-amber-500",
  confused: "bg-yellow-500",
  neutral: "bg-gray-400",
};

interface AdaptiveAgentPanelProps {
  state: AdaptiveTutorState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  setVideoElement?: (el: HTMLVideoElement | null) => void;
  onStart: () => void;
  onStop: () => void;
}

// ── Probability bar ───────────────────────────────────────────────────────────

function ProbBar({
  label, emoji, value, color,
}: { label: string; emoji: string; value: number; color: string }) {
  const safeValue = isFinite(value) ? value : 0;
  const pct = Math.round(safeValue * 100);
  if (pct < 2) return null;
  const barWidth = `${Math.max(4, Math.min(100, pct))}%`;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-gray-600">
        <span>{emoji} {label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${color}`}
          style={{ width: barWidth }}
        />
      </div>
    </div>
  );
}

// ── Action banner ─────────────────────────────────────────────────────────────

const ESCALATION_COLORS = [
  "bg-green-500",   // 0
  "bg-blue-500",    // 1
  "bg-violet-500",  // 2
  "bg-amber-500",   // 3
  "bg-orange-500",  // 4
  "bg-rose-500",    // 5+
];

function headerColor(level: number): string {
  return ESCALATION_COLORS[Math.min(level, ESCALATION_COLORS.length - 1)];
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdaptiveAgentPanel({ state, videoRef, setVideoElement, onStart, onStop }: AdaptiveAgentPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const prevDecision = useRef<PolicyResult | null>(null);

  // Show friendly message when action fires
  useEffect(() => {
    const d = state.lastDecision;
    if (!d || d.action === "DO_NOTHING") return;
    if (d.action === "SUGGEST_BREAK" || d.action === "SUGGEST_TRY_TOMORROW") return;
    if (d === prevDecision.current) return;
    prevDecision.current = d;
    const msg = TUTOR_ACTION_MESSAGE[d.action];
    if (msg) {
      setActionMsg(msg);
      setTimeout(() => setActionMsg(null), 6000);
    }
  }, [state.lastDecision]);

  const { cameraEnabled, cameraError, mediaPipeReady, mediaPipeLoading,
          mediaPipeFps, engagement, generatingContent, escalationLevel } = state;

  const bindVideo = setVideoElement ?? ((el: HTMLVideoElement | null) => {
    (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
  });

  return (
    <>
      {/* Friendly action banner (not scary labels) */}
      <AnimatePresence>
        {actionMsg && (
          <motion.div
            key="action-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl bg-white/97 backdrop-blur border border-glacier-200 text-deep font-semibold text-sm max-w-xs text-center"
          >
            {actionMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent panel — fixed right; inner scroll for stats below camera */}
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="fixed right-4 top-20 z-40 w-64 max-h-[calc(100vh-5rem)] flex flex-col overflow-hidden"
      >
        {/* Header — always visible */}
        <div
          className={`flex-shrink-0 flex items-center justify-between px-3 py-2.5 rounded-2xl text-white shadow-lg cursor-pointer transition-colors duration-500 ${headerColor(escalationLevel)}`}
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {(cameraEnabled && mediaPipeReady) ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </>
              ) : (
                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-white/50" />
              )}
            </span>
            <span className="text-sm font-bold">🧠 AI Agent</span>
            {generatingContent && (
              <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Zap size={8} /> adapting…
              </span>
            )}
          </div>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </div>

        {cameraEnabled && !collapsed && (
          <div className="flex-shrink-0 mt-2 rounded-2xl bg-white/95 backdrop-blur shadow-lg border border-glacier-100 p-3">
            <div className="rounded-xl overflow-hidden bg-black aspect-video relative min-h-[120px]">
              <video
                ref={bindVideo}
                autoPlay
                muted
                playsInline
                className="w-full h-full min-h-[120px] object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {mediaPipeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span className="text-[10px]">Loading AI model…</span>
                </div>
              )}
              {mediaPipeReady && mediaPipeFps > 0 && (
                <div className="absolute top-1 right-1 bg-green-600/90 text-white text-[8px] font-mono px-1.5 py-0.5 rounded-full">
                  {mediaPipeFps} fps · LIVE
                </div>
              )}
              {!state.videoLive && !mediaPipeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-[10px] px-2 text-center">
                  Starting camera…
                </div>
              )}
              {state.videoLive && state.frameBlack && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 text-white text-[10px] px-3 text-center gap-1">
                  <CameraOff size={16} className="text-amber-300" />
                  <span className="font-semibold text-amber-200">Preview is black</span>
                  <span className="text-[9px] text-white/80">Stop camera → Enable again, or check lens cover</span>
                </div>
              )}
              {generatingContent && (
                <div className="absolute bottom-1 right-1 bg-violet-600/90 text-white text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Zap size={8} /> writing…
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keep stream alive when panel collapsed — off-screen, out of flex layout */}
        {cameraEnabled && collapsed && (
          <div
            className="fixed -left-[9999px] top-0 w-[640px] h-[480px] opacity-0 pointer-events-none overflow-hidden"
            aria-hidden
          >
            <video
              ref={bindVideo}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>
        )}

        {/* Collapsible body — scrollable stats below camera */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain modal-scroll mt-2"
            >
              <div className="rounded-2xl bg-white/95 backdrop-blur shadow-lg border border-glacier-100 p-3 space-y-3 pb-4">

                {/* Camera off placeholder */}
                {!cameraEnabled && (
                  <div className="rounded-xl overflow-hidden bg-black/10 aspect-video relative flex flex-col items-center justify-center py-4 gap-2 text-gray-400">
                    <CameraOff size={20} />
                    <span className="text-[10px] text-center px-2">
                      {cameraError ? "Camera unavailable" : "Enable camera for adaptive lessons"}
                    </span>
                  </div>
                )}

                {/* State machine status — only when camera on */}
                {cameraEnabled && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      state.comprehensionState === "UNDERSTOOD"   ? "bg-green-100 text-green-700" :
                      state.comprehensionState === "MONITORING"   ? "bg-blue-100 text-blue-700" :
                      state.comprehensionState === "ESCALATING"   ? "bg-rose-100 text-rose-700" :
                      state.comprehensionState === "INTERVENING"  ? "bg-violet-100 text-violet-700" :
                      state.comprehensionState === "POSSIBLE_CONFUSION" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {state.comprehensionState.replace("_", " ")}
                    </span>
                    {state.mediaPipeFps > 0 && (
                      <span className="text-[9px] text-gray-400 font-mono">{state.mediaPipeFps}fps analysis</span>
                    )}
                  </div>
                )}

                {/* Hybrid emotion probabilities (Strategy C) */}
                {cameraEnabled && state.teachingEmotion?.hybridScores && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                      Hybrid emotions
                    </p>
                    {LAB_EMOTIONS.map((key) => {
                      const v = (state.teachingEmotion?.hybridScores as Record<LabEmotion, number>)?.[key] ?? 0;
                      if (v < 0.02 && key !== state.teachingEmotion?.hybridDominant) return null;
                      const meta = EMOTION_META[key];
                      return (
                        <ProbBar
                          key={key}
                          label={meta.label}
                          emoji={meta.emoji}
                          value={v}
                          color={EMOTION_BAR_CLASS[key]}
                        />
                      );
                    })}
                    {state.teachingEmotion.hybridDominant && (
                      <p className="text-[9px] text-violet-600 text-center font-medium">
                        Primary: {state.teachingEmotion.hybridDominant}
                      </p>
                    )}
                  </div>
                )}

                {/* Learning signals (for state machine) */}
                {engagement && cameraEnabled && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                      Learning signals
                    </p>
                    <ProbBar label="Focused"        emoji="🎯" value={engagement.focused}            color="bg-emerald-400" />
                    <ProbBar label="May need help"  emoji="🤔" value={engagement.possible_confusion} color="bg-amber-400"   />
                    <ProbBar label="Stressed"       emoji="😓" value={engagement.possible_stress}    color="bg-rose-400"    />
                    <ProbBar label="Distracted"     emoji="👀" value={engagement.distracted}          color="bg-purple-400"  />
                    <ProbBar label="Tired"          emoji="😴" value={engagement.tired}              color="bg-violet-400"  />
                    {engagement.no_face_detected > 0.5 && (
                      <p className="text-[10px] text-gray-400 text-center">📷 No face — using behavior signals only</p>
                    )}
                  </div>
                )}

                {/* Current tutor action */}
                {state.lastDecision && state.lastDecision.action !== "DO_NOTHING" && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-violet-600 mb-0.5">Lesson adapted</p>
                    <p className="text-xs text-violet-800 font-semibold">
                      {TUTOR_ACTION_EMOJI[state.lastDecision.action]}{" "}
                      {TUTOR_ACTION_LABEL[state.lastDecision.action]}
                    </p>
                    {escalationLevel > 0 && (
                      <div className="flex gap-0.5 mt-1.5">
                        {Array.from({ length: 7 }).map((_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < escalationLevel ? "bg-violet-400" : "bg-gray-200"}`} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Debug panel */}
                {cameraEnabled && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Debug</p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${
                        state.isCalibrated
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {state.isCalibrated ? "✓ Calibrated" : "⏳ Calibrating 5s…"}
                      </span>
                    </div>
                    {state.debugReason && (
                      <p className="text-[9px] text-gray-500 leading-tight">{state.debugReason}</p>
                    )}
                    {state.debugConfusion > 0 && (
                      <p className="text-[9px] text-amber-600">
                        Confusion score: {Math.round(state.debugConfusion * 100)}% · level {state.escalationLevel}
                      </p>
                    )}
                    {state.escalationLevel > 0 && (
                      <p className="text-[9px] text-violet-600 font-medium">
                        📝 Next answer format: {
                          state.escalationLevel >= 3 ? "simplified + voice"
                          : state.escalationLevel >= 2 ? "with visual"
                          : "step-by-step"
                        }
                      </p>
                    )}
                    <p className="text-[9px] text-gray-400">
                      {state.mediaPipeFps}fps analysis · {state.mediaPipeCamFps}fps camera
                      {state.videoLive ? " · video OK" : " · waiting for video"}
                    </p>
                    {state.frameBrightness !== null && (
                      <p className={`text-[9px] ${state.frameBlack ? "text-rose-600 font-semibold" : "text-gray-400"}`}>
                        Frame brightness: {state.frameBrightness}/255
                        {state.frameBlack ? " · BLACK ⚠" : " · OK"}
                      </p>
                    )}
                    {state.cameraDeviceLabel && (
                      <p className="text-[9px] text-gray-400 truncate">Device: {state.cameraDeviceLabel}</p>
                    )}
                    {state.mediaPipeError && (
                      <p className="text-[9px] text-rose-600">{state.mediaPipeError}</p>
                    )}
                  </div>
                )}

                {/* Camera toggle */}
                <button
                  onClick={() => (cameraEnabled ? onStop() : onStart())}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                    cameraEnabled
                      ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                      : "bg-glacier-50 text-glacier-700 hover:bg-glacier-100 border border-glacier-200"
                  }`}
                >
                  {cameraEnabled
                    ? <><CameraOff size={12} /> Stop Camera</>
                    : <><Camera size={12} /> Enable Smart Camera</>}
                </button>

                {cameraError && (
                  <p className="text-[10px] text-rose-500 text-center leading-tight">{cameraError}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Brain, ChevronDown, ChevronUp } from "lucide-react";
import type { AgentState, Modality } from "@/lib/hooks/useTeachingAgent";

interface EmotionCameraProps {
  agentState: AgentState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStart: () => void;
  onStop: () => void;
  onForceModality: (m: Modality) => void;
  mediaPipeFps?: number;
  mediaPipeReady?: boolean;
  mediaPipeLoading?: boolean;
}

const MODALITY_COLORS: Record<Modality, string> = {
  text: "from-glacier-500 to-blue-500",
  text_image: "from-violet-500 to-purple-500",
  text_image_voice: "from-amber-500 to-orange-500",
  step_by_step: "from-rose-500 to-pink-500",
};

const MODALITY_ICONS: Record<Modality, string> = {
  text: "📝",
  text_image: "🖼️",
  text_image_voice: "🔊",
  step_by_step: "🪜",
};

const MODALITY_LABELS: Record<Modality, string> = {
  text: "Text only",
  text_image: "Text + Image",
  text_image_voice: "Text + Voice",
  step_by_step: "Step by Step",
};

const EMOTION_BG: Record<string, string> = {
  happy:       "bg-green-50 border-green-200 text-green-800",
  focused:     "bg-blue-50 border-blue-200 text-blue-800",
  neutral:     "bg-gray-50 border-gray-200 text-gray-700",
  confused:    "bg-amber-50 border-amber-200 text-amber-800",
  frustrated:  "bg-rose-50 border-rose-200 text-rose-800",
  no_face:     "bg-gray-50 border-gray-200 text-gray-500",
};

export function EmotionCamera({
  agentState,
  videoRef,
  onStart,
  onStop,
  onForceModality,
  mediaPipeFps = 0,
  mediaPipeReady = false,
  mediaPipeLoading = false,
}: EmotionCameraProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const prevModality = useRef<Modality>("text");
  const prevTool = useRef<string | null>(null);

  // Show banner when agent takes action
  useEffect(() => {
    const tool = agentState.lastToolCalled;
    if (!tool || tool === prevTool.current || tool === "do_nothing") return;
    prevTool.current = tool;
    const label = tool.replace(/_/g, " ");
    setNotification(`🤖 Agent: ${agentState.lastReasoning || label}`);
    setTimeout(() => setNotification(null), 5000);
  }, [agentState.lastToolCalled, agentState.lastReasoning]);

  // Show modality change banner
  useEffect(() => {
    const current = agentState.modality;
    if (current === prevModality.current) return;
    prevModality.current = current;
    if (current !== "text") {
      setNotification(`🤖 Switching to: ${MODALITY_LABELS[current]}`);
      setTimeout(() => setNotification(null), 4000);
    }
  }, [agentState.modality]);

  const { latest, cameraEnabled, cameraError, analyzing, lastPlan, lastActions } = agentState;

  return (
    <>
      {/* ── Top notification banner ── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            key="notif"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl shadow-lg bg-white/95 backdrop-blur border border-glacier-200 text-deep font-semibold text-sm max-w-sm text-center"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Agent Panel (fixed right side) ── */}
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="fixed right-4 top-20 z-40 w-64"
      >
        {/* Header bar — always visible */}
        <div
          className={`flex items-center justify-between px-3 py-2.5 rounded-2xl text-white shadow-lg cursor-pointer bg-gradient-to-r ${MODALITY_COLORS[agentState.modality]}`}
          onClick={() => setCollapsed(c => !c)}
        >
          <div className="flex items-center gap-2">
            {/* Pulse dot when analyzing */}
            <span className="relative flex h-3 w-3">
              {analyzing && cameraEnabled ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                </>
              ) : (
                <span className="inline-flex rounded-full h-3 w-3 bg-white/60" />
              )}
            </span>
            <span className="text-sm font-bold">
              {MODALITY_ICONS[agentState.modality]} AI Agent
            </span>
            {latest && (
              <span className="text-lg leading-none">{latest.emoji}</span>
            )}
          </div>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>

        {/* Collapsible body */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 rounded-2xl bg-white/95 backdrop-blur shadow-lg border border-glacier-100 p-3 space-y-3">

                {/* Camera feed */}
                <div className="rounded-xl overflow-hidden bg-black/10 aspect-video relative">
                  {cameraEnabled ? (
                    <>
                      <video
                        ref={videoRef as React.RefObject<HTMLVideoElement>}
                        autoPlay muted playsInline
                        className="w-full h-full object-cover"
                      />
                      {/* MediaPipe loading overlay */}
                      {mediaPipeLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white gap-2">
                          <div className="w-6 h-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span className="text-xs font-medium">Loading AI model…</span>
                        </div>
                      )}
                      {/* FPS badge — real-time indicator */}
                      {mediaPipeReady && mediaPipeFps > 0 && (
                        <div className="absolute top-1.5 right-1.5 bg-green-600/90 text-white text-[9px] font-mono px-1.5 py-0.5 rounded-full">
                          {mediaPipeFps} fps
                        </div>
                      )}
                      {/* Agent thinking spinner (overlay only when analyzing) */}
                      {analyzing && !mediaPipeLoading && (
                        <div className="absolute bottom-1.5 right-1.5 bg-amber-500/90 text-white text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full border border-white border-t-transparent animate-spin" />
                          agent…
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-4 gap-1.5 text-gray-400">
                      <CameraOff size={22} />
                      <span className="text-xs text-center">
                        {cameraError ? "Camera unavailable" : "Camera off"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Emotion badge — live from MediaPipe */}
                {latest && cameraEnabled && (
                  <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${EMOTION_BG[latest.emotion] ?? "bg-gray-50 border-gray-200 text-gray-700"}`}>
                    <span className="text-xl">{latest.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold capitalize text-xs">{latest.emotion}</p>
                        {mediaPipeReady && (
                          <span className="text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded-full font-semibold">LIVE</span>
                        )}
                      </div>
                      <p className="text-xs opacity-80 truncate">{latest.description}</p>
                    </div>
                    <span className="text-xs font-mono opacity-70">{Math.round(latest.confidence * 100)}%</span>
                  </div>
                )}

                {/* Agent plan */}
                {lastPlan && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <p className="text-xs font-bold text-blue-700 flex items-center gap-1 mb-1">
                      <Brain size={11} /> Plan
                    </p>
                    <p className="text-xs text-blue-700 leading-snug">{lastPlan}</p>
                  </div>
                )}

                {/* Actions taken */}
                {lastActions.length > 0 && lastActions.some(a => a.tool_called !== "do_nothing") && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-500">Actions taken:</p>
                    {lastActions.filter(a => a.tool_called !== "do_nothing").map((a, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                        <p className="text-xs font-semibold text-gray-700">
                          {a.tool_emoji} {a.tool_called.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{a.reasoning}</p>
                      </div>
                    ))}
                    {latest?.duration_ms && (
                      <p className="text-xs text-gray-400 font-mono text-right">{latest.duration_ms}ms</p>
                    )}
                  </div>
                )}

                {/* Current mode */}
                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 bg-gradient-to-r ${MODALITY_COLORS[agentState.modality]} text-white`}>
                  <span>{MODALITY_ICONS[agentState.modality]}</span>
                  <div>
                    <p className="text-xs font-bold">Mode</p>
                    <p className="text-xs opacity-90">{MODALITY_LABELS[agentState.modality]}</p>
                  </div>
                </div>

                {/* Camera toggle */}
                <button
                  onClick={cameraEnabled ? onStop : onStart}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition-all ${
                    cameraEnabled
                      ? "bg-rose-100 text-rose-600 hover:bg-rose-200"
                      : "bg-glacier-100 text-glacier-700 hover:bg-glacier-200"
                  }`}
                >
                  {cameraEnabled ? <><CameraOff size={13} /> Stop Camera</> : <><Camera size={13} /> Start Camera</>}
                </button>

                {cameraError && (
                  <p className="text-xs text-rose-500 text-center">{cameraError}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

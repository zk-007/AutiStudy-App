"use client";

/**
 * @deprecated Superseded by useAdaptiveTutorAgent, which combines browser-side
 * emotion detection (MediaPipe + face-api) with the backend Media Agent via
 * POST /api/agent/decide. Do not use this hook in new code.
 *
 * useTeachingAgent
 * ================
 * Legacy hook — kept for reference only.
 *
 * Architecture (Phase 1 — MediaPipe upgrade):
 *  1. Opens webcam (browser WebRTC getUserMedia)
 *  2. MediaPipe Face Landmarker runs at ~30fps in the browser
 *  3. Extracts 478 landmarks + 52 blend shapes → classifies emotion locally
 *  4. When emotion changes (or every 6s) → calls POST /api/agent/decide
 *  5. GPT-4o agent receives pre-analyzed emotion → decides which tool to use
 *  6. Frontend executes the tool (image, voice, steps, analogy, etc.)
 *
 * Benefits over old approach:
 *  - Real-time emotion display (30fps, no spinner)
 *  - Agent calls only when needed (not every frame)
 *  - No student face sent to OpenAI for CV (privacy)
 *  - ~500ms faster per agent cycle
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api/client";
import { useMediaPipeEmotion, type EmotionFrame } from "./useMediaPipeEmotion";

export type Modality =
  | "text"
  | "text_image"
  | "text_image_voice"
  | "step_by_step";

export interface AgentActionData {
  simplified_explanation?: string;
  steps?: string[];
  analogy?: string;
  check_question?: string;
  prerequisite?: string;
  visual_description?: string;
  topic?: string;
}

export interface EmotionSnapshot {
  emotion: string;
  confidence: number;
  understood: boolean;
  description: string;
  emoji: string;
  modality: Modality;
  action: string;
  modality_label: string;
  // True agent fields
  tool_called?: string;
  tool_emoji?: string;
  reasoning?: string;
  action_data?: AgentActionData;
  duration_ms?: number;
  timestamp: number;
}

export interface AgentAction {
  iteration: number;
  tool_called: string;
  tool_emoji: string;
  reasoning: string;
  action_data: AgentActionData;
  observation: string;
}

export interface AgentState {
  modality: Modality;
  latest: EmotionSnapshot | null;
  history: EmotionSnapshot[];
  consecutiveConfused: number;
  consecutiveUnderstood: number;
  cameraEnabled: boolean;
  cameraError: string | null;
  analyzing: boolean;
  // Full agentic fields
  lastReasoning: string | null;
  lastToolCalled: string | null;
  lastPlan: string | null;
  lastActions: AgentAction[];
  toolsUsedThisSession: string[];
  memoryContext: string | null;
}

const CONSENT_KEY = "autistudy_camera_consent"; // localStorage key

export function getCameraConsent(): "granted" | "denied" | "pending" {
  if (typeof window === "undefined") return "pending";
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "granted") return "granted";
  if (val === "denied") return "denied";
  return "pending";
}

export function setCameraConsent(value: "granted" | "denied") {
  if (typeof window !== "undefined") {
    localStorage.setItem(CONSENT_KEY, value);
  }
}

export function useTeachingAgent(sessionId: string | null) {
  const [state, setState] = useState<AgentState>({
    modality: "text",
    latest: null,
    history: [],
    consecutiveConfused: 0,
    consecutiveUnderstood: 0,
    cameraEnabled: false,
    cameraError: null,
    analyzing: false,
    lastReasoning: null,
    lastToolCalled: null,
    lastPlan: null,
    lastActions: [],
    toolsUsedThisSession: [],
    memoryContext: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzeRef = useRef(false); // prevent overlapping agent calls

  // ── Start webcam ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (streamRef.current) return; // already running
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState((prev) => ({ ...prev, cameraEnabled: true, cameraError: null }));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Camera permission denied";
      setState((prev) => ({ ...prev, cameraError: msg }));
    }
  }, []);

  // ── Stop webcam ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState((prev) => ({ ...prev, cameraEnabled: false, analyzing: false }));
  }, []);

  // ── Agent decision call (called by MediaPipe when emotion changes) ─────────
  const callAgentDecide = useCallback(async (frame: EmotionFrame) => {
    if (!sessionId || analyzeRef.current) return;
    analyzeRef.current = true;
    setState((prev) => ({ ...prev, analyzing: true }));
    try {
      const token = localStorage.getItem("autistudy_token");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/agent/decide`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            session_id: sessionId,
            emotion: frame.emotion,
            confidence: frame.confidence,
            understood: frame.understood,
            description: frame.description,
            consecutive_confused: state.consecutiveConfused,
            tools_used_this_session: state.toolsUsedThisSession,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        // Quota or server error — stop spinning, don't retry immediately
        setState((prev) => ({ ...prev, analyzing: false }));
        analyzeRef.current = false;
        return;
      }
      const data = await res.json();
      const modality = (data.modality ?? "text") as Modality;

      const snapshot: EmotionSnapshot = {
        emotion: frame.emotion,
        confidence: frame.confidence,
        understood: frame.understood,
        description: frame.description,
        emoji: frame.emoji,
        modality,
        action: data.tool_called,
        modality_label: modality,
        tool_called: data.tool_called,
        tool_emoji: data.tool_emoji,
        reasoning: data.reasoning,
        action_data: data.action_data,
        duration_ms: data.duration_ms,
        timestamp: Date.now(),
      };

      setState((prev) => {
        const newConsecutiveConfused =
          frame.understood ? 0
          : frame.emotion === "confused" || frame.emotion === "frustrated" || frame.emotion === "bored"
          ? prev.consecutiveConfused + 1
          : prev.consecutiveConfused;

        return {
          ...prev,
          modality,
          latest: snapshot,
          history: [...prev.history.slice(-9), snapshot],
          consecutiveConfused: newConsecutiveConfused,
          consecutiveUnderstood: frame.understood ? prev.consecutiveUnderstood + 1 : 0,
          analyzing: false,
          lastReasoning: data.reasoning ?? null,
          lastToolCalled: data.tool_called ?? null,
          lastPlan: data.plan ?? null,
          lastActions: data.actions ?? [],
          toolsUsedThisSession: data.tools_used_this_session ?? prev.toolsUsedThisSession,
          memoryContext: data.memory_context ?? null,
        };
      });
    } catch {
      setState((prev) => ({ ...prev, analyzing: false }));
    } finally {
      analyzeRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, state.consecutiveConfused, state.toolsUsedThisSession]);

  // ── MediaPipe real-time emotion detection (30fps in browser) ─────────────
  const mediaPipeState = useMediaPipeEmotion(
    videoRef,
    state.cameraEnabled,
    callAgentDecide   // called only when emotion changes or every 6s
  );

  // Sync MediaPipe real-time frame to agent state for display
  useEffect(() => {
    if (!mediaPipeState.currentFrame) return;
    const f = mediaPipeState.currentFrame;
    setState((prev) => ({
      ...prev,
      latest: prev.latest
        ? { ...prev.latest, emotion: f.emotion, confidence: f.confidence,
            understood: f.understood, description: f.description, emoji: f.emoji }
        : {
            emotion: f.emotion, confidence: f.confidence, understood: f.understood,
            description: f.description, emoji: f.emoji, modality: "text",
            action: "", modality_label: "Text only", timestamp: f.timestamp,
          },
    }));
  }, [mediaPipeState.currentFrame]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // ── Manual modality override ─────────────────────────────────────────────
  const forceModality = useCallback(
    async (modality: Modality) => {
      if (!sessionId) return;
      try {
        const token = localStorage.getItem("autistudy_token");
        const res = await fetch(`${API_BASE}/api/agent/force-modality`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ session_id: sessionId, modality }),
        });
        if (res.ok) {
          setState((prev) => ({ ...prev, modality }));
        }
      } catch {
        // silently ignore
      }
    },
    [sessionId]
  );

  return {
    state,
    videoRef,
    startCamera,
    stopCamera,
    forceModality,
    mediaPipeFps: mediaPipeState.fps,
    mediaPipeReady: mediaPipeState.ready,
    mediaPipeLoading: mediaPipeState.loading,
  };
}

"use client";

/**
 * useMediaPipeEmotion — FIXED for real-time performance
 * ======================================================
 *
 * ROOT CAUSE OF 1fps BUG (now fixed):
 *   Old code called setState({ latestSignal }) on EVERY frame (30/s).
 *   That re-rendered the parent, recreated the detect callback,
 *   cancelled + restarted the RAF loop → effectively 1fps.
 *
 * Fix:
 *   • Analysis is throttled to target 15fps via timestamp gate
 *   • NO per-frame setState — signals go directly into a ref callback
 *   • State is only updated for: fps counter (1/s), ready, loading, error
 *   • RAF loop is NEVER cancelled by state updates
 *
 * Signals per analysis frame:
 *   52 blend shapes + EAR + head yaw + head pitch + face presence
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { FaceSignal } from "@/lib/agent/types";

const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const ANALYZE_INTERVAL_MS = 67; // target ~15fps for analysis (not camera fps)

export interface MediaPipeState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  fps: number;        // actual analysis fps (updated every second)
  cameraFps: number;  // raw RAF fps (updated every second)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBS(
  categories: Array<{ categoryName: string; score: number }>,
  name: string
): number {
  return categories.find((b) => b.categoryName === name)?.score ?? 0;
}

function avg2(a: number, b: number) { return (a + b) / 2; }

function dist2D(lm: Array<{ x: number; y: number }>, a: number, b: number): number {
  const dx = lm[a].x - lm[b].x;
  const dy = lm[a].y - lm[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function calcEAR(lm: Array<{ x: number; y: number; z: number }>): number {
  if (lm.length < 470) return 0.28;
  const earL = (dist2D(lm, 385, 380) + dist2D(lm, 387, 373)) / (2 * dist2D(lm, 362, 263));
  const earR = (dist2D(lm, 160, 144) + dist2D(lm, 158, 153)) / (2 * dist2D(lm, 33, 133));
  return isFinite(earL) && isFinite(earR) ? (earL + earR) / 2 : 0.28;
}

function calcHeadYaw(lm: Array<{ x: number; y: number; z: number }>): number {
  if (lm.length < 470) return 0;
  const noseTip   = lm[4];
  const leftCheek  = lm[234];
  const rightCheek = lm[454];
  const faceWidth  = rightCheek.x - leftCheek.x;
  if (faceWidth < 0.01) return 0;
  const center = (leftCheek.x + rightCheek.x) / 2;
  return (noseTip.x - center) / (faceWidth / 2);
}

function calcHeadPitch(lm: Array<{ x: number; y: number; z: number }>): number {
  if (lm.length < 470) return 0;
  const noseTip  = lm[4];
  const forehead = lm[10];
  const chin     = lm[152];
  const faceH    = chin.y - forehead.y;
  if (faceH < 0.01) return 0;
  const center = (forehead.y + chin.y) / 2;
  return (noseTip.y - center) / (faceH / 2);
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useMediaPipeEmotion(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  cameraEnabled: boolean,
  onSignal: (signal: FaceSignal) => void  // MUST be stable (useCallback with empty deps)
): MediaPipeState {
  const [state, setState] = useState<MediaPipeState>({
    ready: false, loading: false, error: null, fps: 0, cameraFps: 0,
  });

  const landmarkerRef   = useRef<FaceLandmarker | null>(null);
  const rafRef          = useRef<number | null>(null);
  const loopActiveRef   = useRef(false);
  const onSignalRef     = useRef(onSignal);
  onSignalRef.current   = onSignal; // always latest, no dep array needed

  // FPS tracking
  const analyzeCount    = useRef(0);
  const rafCount        = useRef(0);
  const fpsTimer        = useRef(Date.now());
  const lastAnalyzeTime = useRef(0);
  const videoReadyRef   = useRef(false);

  // ── Load model ────────────────────────────────────────────────────────────
  const loadModel = useCallback(async () => {
    if (landmarkerRef.current) return;
    setState((p) => ({ ...p, loading: true, error: null }));
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fs = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
        const lm = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        landmarkerRef.current = lm;
        setState((p) => ({ ...p, ready: true, loading: false }));
        return;
      } catch {
        if (delegate === "CPU") {
          setState((p) => ({ ...p, loading: false, error: "MediaPipe failed to load" }));
        }
      }
    }
  }, []);

  const stopLoop = useCallback(() => {
    loopActiveRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    if (loopActiveRef.current || !landmarkerRef.current) return;
    loopActiveRef.current = true;
    const tick = () => {
      if (!loopActiveRef.current) return;
      detectRef.current();
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const detectRef = useRef<() => void>(() => {});

  // ── Detection loop (RAF — stable callback via detectRef) ─────────────────
  const detect = useCallback(() => {
    if (!loopActiveRef.current) return;

    const video = videoRef.current;
    const lm    = landmarkerRef.current;
    rafCount.current++;

    // FPS counter — update state only 1x per second (not per-frame!)
    const now = Date.now();
    if (now - fpsTimer.current >= 1000) {
      const analysisFps = analyzeCount.current;
      const camFps      = rafCount.current;
      analyzeCount.current = 0;
      rafCount.current     = 0;
      fpsTimer.current     = now;
      setState((p) => ({ ...p, fps: analysisFps, cameraFps: camFps }));
    }

    // Queue next frame
    rafRef.current = requestAnimationFrame(() => detectRef.current());

    // THROTTLE: only analyze at ~15fps, not every RAF frame
    if (now - lastAnalyzeTime.current < ANALYZE_INTERVAL_MS) return;
    lastAnalyzeTime.current = now;

    const videoReady =
      !!video &&
      !video.paused &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;

    videoReadyRef.current = videoReady;

    if (!video || !lm || !videoReady) return;

    // Run analysis
    let result: FaceLandmarkerResult;
    try {
      result = lm.detectForVideo(video, now);
    } catch {
      return;
    }
    analyzeCount.current++;

    const faces  = result.faceLandmarks;
    const bsList = result.faceBlendshapes;

    if (!faces || faces.length === 0) {
      onSignalRef.current({
        timestamp: now, facePresent: false, faceConfidence: 0,
        browDown: 0, browInnerUp: 0, smile: 0, cheekSquint: 0, jawOpen: 0,
        eyeBlink: 0, eyeWide: 0, mouthFrown: 0, noseSneer: 0,
        ear: 0.28, blinkDetected: false, headYaw: 0, headPitch: 0,
      });
      return;
    }

    const landmarks = faces[0];
    const rawBS     = bsList?.[0]?.categories ?? [];

    const signal: FaceSignal = {
      timestamp:     now,
      facePresent:   true,
      faceConfidence: 0.9,
      browDown:      avg2(getBS(rawBS, "browDownLeft"),    getBS(rawBS, "browDownRight")),
      browInnerUp:   getBS(rawBS, "browInnerUp"),
      smile:         avg2(getBS(rawBS, "mouthSmileLeft"),  getBS(rawBS, "mouthSmileRight")),
      cheekSquint:   avg2(getBS(rawBS, "cheekSquintLeft"), getBS(rawBS, "cheekSquintRight")),
      jawOpen:       getBS(rawBS, "jawOpen"),
      eyeBlink:      avg2(getBS(rawBS, "eyeBlinkLeft"),    getBS(rawBS, "eyeBlinkRight")),
      eyeWide:       avg2(getBS(rawBS, "eyeWideLeft"),     getBS(rawBS, "eyeWideRight")),
      mouthFrown:    avg2(getBS(rawBS, "mouthFrownLeft"),  getBS(rawBS, "mouthFrownRight")),
      noseSneer:     avg2(getBS(rawBS, "noseSneerLeft"),   getBS(rawBS, "noseSneerRight")),
      ear:           calcEAR(landmarks),
      blinkDetected: false,
      headYaw:       calcHeadYaw(landmarks),
      headPitch:     calcHeadPitch(landmarks),
    };

    // Pass directly to buffer via ref callback — NO setState!
    onSignalRef.current(signal);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  detectRef.current = detect;

  // ── Start/stop loop when model + camera are ready ─────────────────────────
  useEffect(() => {
    if (!cameraEnabled || !state.ready) {
      stopLoop();
      return;
    }
    startLoop();
    return () => stopLoop();
  }, [cameraEnabled, state.ready, startLoop, stopLoop]);

  // ── Restart loop when video element receives frames (fixes 0fps analysis) ─
  useEffect(() => {
    if (!cameraEnabled || !state.ready) return;

    const kick = () => {
      const video = videoRef.current;
      if (!video) return;
      videoReadyRef.current =
        video.readyState >= 2 && video.videoWidth > 0 && !video.paused;
      if (videoReadyRef.current && !loopActiveRef.current) {
        startLoop();
      }
    };

    const video = videoRef.current;
    if (video) {
      video.addEventListener("loadeddata", kick);
      video.addEventListener("playing", kick);
      video.addEventListener("resize", kick);
      kick();
    }

    // Poll until <video> ref is mounted and stream is playing
    const poll = setInterval(kick, 250);

    return () => {
      clearInterval(poll);
      if (video) {
        video.removeEventListener("loadeddata", kick);
        video.removeEventListener("playing", kick);
        video.removeEventListener("resize", kick);
      }
    };
  }, [cameraEnabled, state.ready, startLoop]);

  // ── Load model when camera turns on ──────────────────────────────────────
  useEffect(() => {
    if (cameraEnabled && !state.ready && !state.loading) loadModel();
  }, [cameraEnabled, state.ready, state.loading, loadModel]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => stopLoop(), [stopLoop]);

  return state;
}

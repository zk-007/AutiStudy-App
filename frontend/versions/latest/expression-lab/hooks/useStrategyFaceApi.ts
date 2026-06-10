"use client";

import { useEffect, useRef, useState } from "react";
import { classifyFromFaceApi } from "../shared/classifiers";
import { enrichWithFaceApi, loadFaceApiModels } from "../shared/faceApiLoader";
import { extractFrameFeatures, loadMediaPipeLandmarker } from "../shared/mediapipeLoader";
import { LabSignalBuffer } from "../shared/SignalBuffer";
import type { LabEmotionScores } from "../types";
import { finalizeScores } from "../types";

const INTERVAL_MS = 500;

/**
 * Strategy B uses face-api CNN for emotions.
 * MediaPipe is used only for geometry (yaw, jaw, EAR) to help map bored/tired/inattentive.
 */
export function useStrategyFaceApi(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [result, setResult] = useState<LabEmotionScores | null>(null);
  const bufferRef = useRef(new LabSignalBuffer(2500));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCount = useRef(0);
  const fpsTimer = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      bufferRef.current.clear();
      setResult(null);
      return;
    }

    setLoading(true);
    Promise.all([loadFaceApiModels(), loadMediaPipeLandmarker()])
      .then(() => {
        setReady(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    timerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const lm = await loadMediaPipeLandmarker();
        let frame = extractFrameFeatures(video, lm);
        if (!frame) return;

        frame = await enrichWithFaceApi(frame, video);
        const raw = classifyFromFaceApi(frame);
        bufferRef.current.push(raw, frame.timestamp);
        setResult(finalizeScores(bufferRef.current.getSmoothed(), frame.facePresent));

        frameCount.current++;
        const now = Date.now();
        if (now - fpsTimer.current >= 1000) {
          setFps(frameCount.current);
          frameCount.current = 0;
          fpsTimer.current = now;
        }
      } catch {
        /* skip */
      }
    }, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, videoRef]);

  return { ready, loading, fps, result };
}

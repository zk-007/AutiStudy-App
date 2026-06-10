"use client";

import { useEffect, useRef, useState } from "react";
import { classifyHybrid } from "../shared/classifiers";
import { enrichWithFaceApi, loadFaceApiModels } from "../shared/faceApiLoader";
import { extractFrameFeatures, loadMediaPipeLandmarker } from "../shared/mediapipeLoader";
import { LabSignalBuffer } from "../shared/SignalBuffer";
import type { LabEmotionScores } from "../types";
import { finalizeScores } from "../types";

const INTERVAL_MS = 100;

export function useStrategyHybrid(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [result, setResult] = useState<LabEmotionScores | null>(null);
  const bufferRef = useRef(new LabSignalBuffer(3000));
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

    let faceApiTick = 0;

    timerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const lm = await loadMediaPipeLandmarker();
        let frame = extractFrameFeatures(video, lm);
        if (!frame) return;

        faceApiTick++;
        if (faceApiTick % 5 === 0) {
          frame = await enrichWithFaceApi(frame, video);
        }

        const geoSmooth = bufferRef.current.getSmoothed();
        const raw = classifyHybrid(frame, geoSmooth);
        bufferRef.current.push(raw, frame.timestamp, frame.eyeBlink > 0.55);
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

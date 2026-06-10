"use client";

import { useEffect, useRef, useState } from "react";
import { classifyFromBlendshapes } from "../shared/classifiers";
import { extractFrameFeatures, loadMediaPipeLandmarker } from "../shared/mediapipeLoader";
import { LabSignalBuffer } from "../shared/SignalBuffer";
import type { LabEmotionScores } from "../types";
import { finalizeScores } from "../types";

const INTERVAL_MS = 67;

export function useStrategyMediapipe(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [result, setResult] = useState<LabEmotionScores | null>(null);
  const bufferRef = useRef(new LabSignalBuffer(2000));
  const rafRef = useRef<number | null>(null);
  const frameCount = useRef(0);
  const fpsTimer = useRef(Date.now());

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current) clearTimeout(rafRef.current);
      bufferRef.current.clear();
      setResult(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadMediaPipeLandmarker()
      .then(() => {
        if (cancelled) return;
        setReady(true);
        setLoading(false);

        const loop = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2) {
            rafRef.current = window.setTimeout(loop, INTERVAL_MS);
            return;
          }
          try {
            const lm = await loadMediaPipeLandmarker();
            const frame = extractFrameFeatures(video, lm);
            if (frame) {
              const raw = classifyFromBlendshapes(frame);
              bufferRef.current.push(raw, frame.timestamp, frame.eyeBlink > 0.55);
              setResult(finalizeScores(bufferRef.current.getSmoothed(), frame.facePresent));
              frameCount.current++;
              const now = Date.now();
              if (now - fpsTimer.current >= 1000) {
                setFps(frameCount.current);
                frameCount.current = 0;
                fpsTimer.current = now;
              }
            }
          } catch {
            /* skip */
          }
          rafRef.current = window.setTimeout(loop, INTERVAL_MS);
        };

        loop();
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [enabled, videoRef]);

  return { ready, loading, fps, result };
}

"use client";

/**
 * useFaceApiEmotion
 * =================
 * Uses face-api.js TinyFaceDetector + FaceExpressionNet to detect real emotions:
 *   happy, sad, angry, fearful, disgusted, surprised, neutral
 *
 * Runs entirely in the browser — no API calls, no cost.
 * Updates every 500ms (2fps) — lightweight enough for background use.
 *
 * Returns probabilities between 0 and 1 for each emotion.
 */

import { useEffect, useRef, useState } from "react";

export interface FaceApiEmotions {
  neutral:    number;
  happy:      number;
  sad:        number;
  angry:      number;
  fearful:    number;
  disgusted:  number;
  surprised:  number;
  confidence: number; // face detection score (0=no face, 1=very confident)
}

const EMPTY: FaceApiEmotions = {
  neutral: 0, happy: 0, sad: 0, angry: 0,
  fearful: 0, disgusted: 0, surprised: 0, confidence: 0,
};

const MODEL_URL = "/face-api-models";
const INTERVAL_MS = 500; // analyse every 500ms

export function useFaceApiEmotion(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean
) {
  const [emotions, setEmotions] = useState<FaceApiEmotions>(EMPTY);
  const [ready, setReady]       = useState(false);
  const [loading, setLoading]   = useState(false);
  const timerRef                = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadedRef               = useRef(false);

  // Load models once
  useEffect(() => {
    if (loadedRef.current || !enabled) return;
    loadedRef.current = true;
    setLoading(true);

    import("face-api.js").then(async (faceapi) => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setReady(true);
      } catch (e) {
        console.warn("[useFaceApiEmotion] model load failed:", e);
      } finally {
        setLoading(false);
      }
    });
  }, [enabled]);

  // Run detection loop
  useEffect(() => {
    if (!ready || !enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth < 1) return;

      try {
        const faceapi = (await import("face-api.js")).default ??
                        await import("face-api.js");
        const det = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceExpressions();

        if (!det) {
          setEmotions((p) => ({ ...EMPTY, confidence: 0 }));
          return;
        }

        const ex = det.expressions;
        setEmotions({
          neutral:    ex.neutral    ?? 0,
          happy:      ex.happy      ?? 0,
          sad:        ex.sad        ?? 0,
          angry:      ex.angry      ?? 0,
          fearful:    ex.fearful    ?? 0,
          disgusted:  ex.disgusted  ?? 0,
          surprised:  ex.surprised  ?? 0,
          confidence: det.detection.score,
        });
      } catch {
        // silently skip frame on error
      }
    }, INTERVAL_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [ready, enabled, videoRef]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled) setEmotions(EMPTY);
  }, [enabled]);

  return { emotions, ready, loading };
}

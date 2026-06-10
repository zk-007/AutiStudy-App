import type { LabEmotion, LabFrameFeatures } from "../types";

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Strategy A — rule-based from MediaPipe blendshapes + geometry only.
 */
export function classifyFromBlendshapes(f: LabFrameFeatures): Record<LabEmotion, number> {
  if (!f.facePresent) {
    return { happy: 0, sad: 0, frustrated: 0, bored: 0, tired: 0, inattentive: 0, confused: 0, neutral: 1 };
  }

  const yaw = Math.abs(f.headYaw);
  const pitch = Math.abs(f.headPitch);
  const lowEar = clamp((0.22 - f.ear) * 4);

  const happy = clamp(f.smile * 0.55 + f.cheekSquint * 0.35 + (1 - f.browDown) * 0.1);
  const sad = clamp(f.mouthFrown * 0.4 + f.browInnerUp * 0.35 + (1 - f.smile) * 0.15);
  const frustrated = clamp(
    f.browDown * 0.35 + f.mouthFrown * 0.3 + f.noseSneer * 0.2 + f.eyeWide * 0.15
  );
  const bored = clamp(f.jawOpen * 0.45 + lowEar * 0.25 + yaw * 0.15);
  const tired = clamp(
    lowEar * 0.4 + f.jawOpen * 0.25 + clamp(f.blinkRate / 25) * 0.2 + (1 - f.smile) * 0.1
  );
  const inattentive = clamp(yaw * 0.45 + pitch * 0.3 + (1 - f.faceConfidence) * 0.15);
  const confused = clamp(
    f.browDown * 0.25 + f.browInnerUp * 0.35 + f.jawOpen * 0.2 + f.eyeWide * 0.1
  );

  const strong = Math.max(happy, sad, frustrated, bored, tired, inattentive, confused);
  const neutral = strong < 0.25 ? 0.7 : clamp(0.35 - strong * 0.3);

  return { happy, sad, frustrated, bored, tired, inattentive, confused, neutral };
}

/**
 * Strategy B — face-api.js expression probabilities remapped.
 */
export function classifyFromFaceApi(f: LabFrameFeatures): Record<LabEmotion, number> {
  if (!f.facePresent || f.faNeutral === undefined) {
    return { happy: 0, sad: 0, frustrated: 0, bored: 0, tired: 0, inattentive: 0, confused: 0, neutral: 1 };
  }

  const h = f.faHappy ?? 0;
  const s = f.faSad ?? 0;
  const a = f.faAngry ?? 0;
  const fear = f.faFearful ?? 0;
  const disg = f.faDisgusted ?? 0;
  const surp = f.faSurprised ?? 0;
  const n = f.faNeutral ?? 0;

  const happy = clamp(h + surp * 0.15);
  const sad = clamp(s + fear * 0.2);
  const frustrated = clamp(a * 0.65 + disg * 0.35);
  const bored = clamp(n * 0.5 + (1 - h - s - a) * 0.2 + f.jawOpen * 0.2);
  const tired = clamp(fear * 0.35 + s * 0.25 + n * 0.2 + f.jawOpen * 0.15);
  const inattentive = clamp(n * 0.35 + Math.abs(f.headYaw) * 0.35 + (1 - f.faceConfidence) * 0.2);
  const confused = clamp(surp * 0.4 + fear * 0.3 + s * 0.2 + f.browInnerUp * 0.1);
  const neutral = clamp(n * 0.8);

  return { happy, sad, frustrated, bored, tired, inattentive, confused, neutral };
}

/**
 * Strategy C — weighted fusion of blendshapes + face-api + geometry.
 */
export function classifyHybrid(
  f: LabFrameFeatures,
  smoothedGeometry?: Record<LabEmotion, number>
): Record<LabEmotion, number> {
  const geo = classifyFromBlendshapes({ ...f, blinkRate: f.blinkRate });
  const cnn = classifyFromFaceApi(f);

  const out = {} as Record<LabEmotion, number>;
  const keys: LabEmotion[] = [
    "happy", "sad", "frustrated", "bored", "tired", "inattentive", "confused", "neutral",
  ];

  for (const k of keys) {
    const g = geo[k] ?? 0;
    const c = cnn[k] ?? 0;
    const s = smoothedGeometry?.[k] ?? g;
    // CNN strong on happy/sad/frustrated; geometry strong on tired/bored/inattentive
    if (k === "happy" || k === "sad" || k === "frustrated") {
      out[k] = c * 0.55 + g * 0.25 + s * 0.2;
    } else if (k === "bored" || k === "tired" || k === "inattentive") {
      out[k] = g * 0.5 + s * 0.35 + c * 0.15;
    } else if (k === "confused") {
      out[k] = g * 0.4 + c * 0.35 + s * 0.25;
    } else {
      out[k] = g * 0.35 + c * 0.35 + s * 0.3;
    }
  }

  return out;
}

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { LabFrameFeatures } from "../types";

const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let landmarker: FaceLandmarker | null = null;
let loadPromise: Promise<FaceLandmarker> | null = null;

function getBS(categories: Array<{ categoryName: string; score: number }>, name: string) {
  return categories.find((b) => b.categoryName === name)?.score ?? 0;
}

function avg2(a: number, b: number) {
  return (a + b) / 2;
}

function dist2D(lm: Array<{ x: number; y: number }>, a: number, b: number) {
  const dx = lm[a].x - lm[b].x;
  const dy = lm[a].y - lm[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}

function calcEAR(lm: Array<{ x: number; y: number; z: number }>) {
  if (lm.length < 470) return 0.28;
  const earL = (dist2D(lm, 385, 380) + dist2D(lm, 387, 373)) / (2 * dist2D(lm, 362, 263));
  const earR = (dist2D(lm, 160, 144) + dist2D(lm, 158, 153)) / (2 * dist2D(lm, 33, 133));
  return isFinite(earL) && isFinite(earR) ? (earL + earR) / 2 : 0.28;
}

function calcHeadYaw(lm: Array<{ x: number; y: number; z: number }>) {
  if (lm.length < 470) return 0;
  const noseTip = lm[4];
  const leftCheek = lm[234];
  const rightCheek = lm[454];
  const faceWidth = rightCheek.x - leftCheek.x;
  if (faceWidth < 0.01) return 0;
  const center = (leftCheek.x + rightCheek.x) / 2;
  return (noseTip.x - center) / (faceWidth / 2);
}

function calcHeadPitch(lm: Array<{ x: number; y: number; z: number }>) {
  if (lm.length < 470) return 0;
  const noseTip = lm[4];
  const forehead = lm[10];
  const chin = lm[152];
  const faceH = chin.y - forehead.y;
  if (faceH < 0.01) return 0;
  const center = (forehead.y + chin.y) / 2;
  return (noseTip.y - center) / (faceH / 2);
}

export async function loadMediaPipeLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fs = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        landmarker = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        return landmarker;
      } catch {
        /* try CPU */
      }
    }
    throw new Error("MediaPipe Face Landmarker failed to load");
  })();

  return loadPromise;
}

let lastBlink = false;
let blinkCount = 0;
let blinkWindowStart = Date.now();

export function extractFrameFeatures(
  video: HTMLVideoElement,
  lm: FaceLandmarker
): LabFrameFeatures | null {
  const now = Date.now();
  let result;
  try {
    result = lm.detectForVideo(video, now);
  } catch {
    return null;
  }

  const faces = result.faceLandmarks;
  const bsList = result.faceBlendshapes;

  if (!faces?.length) {
    return {
      timestamp: now,
      facePresent: false,
      faceConfidence: 0,
      browDown: 0,
      browInnerUp: 0,
      smile: 0,
      cheekSquint: 0,
      jawOpen: 0,
      eyeBlink: 0,
      eyeWide: 0,
      mouthFrown: 0,
      noseSneer: 0,
      ear: 0.28,
      headYaw: 0,
      headPitch: 0,
      blinkRate: 0,
    };
  }

  const landmarks = faces[0];
  const rawBS = bsList?.[0]?.categories ?? [];
  const eyeBlink = avg2(getBS(rawBS, "eyeBlinkLeft"), getBS(rawBS, "eyeBlinkRight"));
  const blinkNow = eyeBlink > 0.55;
  if (blinkNow && !lastBlink) blinkCount++;
  lastBlink = blinkNow;
  if (now - blinkWindowStart > 60000) {
    blinkCount = blinkNow ? 1 : 0;
    blinkWindowStart = now;
  }
  const elapsedMin = (now - blinkWindowStart) / 60000;
  const blinkRate = elapsedMin > 0.05 ? blinkCount / elapsedMin : 0;

  return {
    timestamp: now,
    facePresent: true,
    faceConfidence: 0.9,
    browDown: avg2(getBS(rawBS, "browDownLeft"), getBS(rawBS, "browDownRight")),
    browInnerUp: getBS(rawBS, "browInnerUp"),
    smile: avg2(getBS(rawBS, "mouthSmileLeft"), getBS(rawBS, "mouthSmileRight")),
    cheekSquint: avg2(getBS(rawBS, "cheekSquintLeft"), getBS(rawBS, "cheekSquintRight")),
    jawOpen: getBS(rawBS, "jawOpen"),
    eyeBlink,
    eyeWide: avg2(getBS(rawBS, "eyeWideLeft"), getBS(rawBS, "eyeWideRight")),
    mouthFrown: avg2(getBS(rawBS, "mouthFrownLeft"), getBS(rawBS, "mouthFrownRight")),
    noseSneer: avg2(getBS(rawBS, "noseSneerLeft"), getBS(rawBS, "noseSneerRight")),
    ear: calcEAR(landmarks),
    headYaw: calcHeadYaw(landmarks),
    headPitch: calcHeadPitch(landmarks),
    blinkRate,
  };
}

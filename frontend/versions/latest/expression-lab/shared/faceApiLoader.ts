import type { LabFrameFeatures } from "../types";

const MODEL_URL = "/face-api-models";

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

export async function loadFaceApiModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const faceapi = (await import("face-api.js")).default ?? (await import("face-api.js"));
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  })();

  return loadPromise;
}

export async function enrichWithFaceApi(
  frame: LabFrameFeatures,
  video: HTMLVideoElement
): Promise<LabFrameFeatures> {
  if (!frame.facePresent || video.readyState < 2) return frame;

  try {
    const faceapi = (await import("face-api.js")).default ?? (await import("face-api.js"));
    const det = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
      .withFaceExpressions();

    if (!det) return frame;

    const e = det.expressions;
    return {
      ...frame,
      faceConfidence: det.detection.score,
      faHappy: e.happy,
      faSad: e.sad,
      faAngry: e.angry,
      faFearful: e.fearful,
      faDisgusted: e.disgusted,
      faSurprised: e.surprised,
      faNeutral: e.neutral,
    };
  } catch {
    return frame;
  }
}

/**
 * Load MediaPipe Vision from /public/mediapipe — avoids Next.js broken dynamic chunks.
 */

/** V1 used jsdelivr WASM — local /mediapipe/wasm can fail MIME/path on some dev setups. */
export const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const MEDIAPIPE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface VisionModule {
  FaceLandmarker: typeof import("@mediapipe/tasks-vision").FaceLandmarker;
  FilesetResolver: typeof import("@mediapipe/tasks-vision").FilesetResolver;
}

let visionModule: VisionModule | null = null;
let loadPromise: Promise<VisionModule> | null = null;

export async function loadVisionModule(): Promise<VisionModule> {
  if (visionModule) return visionModule;
  if (loadPromise) return loadPromise;

  loadPromise = import(
    /* webpackIgnore: true */
    "/mediapipe/vision_bundle.mjs"
  ).then((mod) => {
    visionModule = mod as VisionModule;
    return visionModule;
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

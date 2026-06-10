import type { LabEmotion, StrategyInfo, StrategyId } from "./types";

export const EMOTION_META: Record<
  LabEmotion,
  { emoji: string; label: string; color: string; bar: string }
> = {
  happy:       { emoji: "😊", label: "Happy",       color: "text-emerald-700", bar: "bg-emerald-500" },
  sad:         { emoji: "😢", label: "Sad",         color: "text-indigo-700", bar: "bg-indigo-500" },
  frustrated:  { emoji: "😣", label: "Frustrated",  color: "text-rose-700",    bar: "bg-rose-500" },
  bored:       { emoji: "😑", label: "Bored",       color: "text-slate-600",   bar: "bg-slate-400" },
  tired:       { emoji: "😴", label: "Tired",       color: "text-violet-700",  bar: "bg-violet-500" },
  inattentive: { emoji: "👀", label: "Inattentive", color: "text-amber-700",   bar: "bg-amber-500" },
  confused:    { emoji: "😕", label: "Confused",    color: "text-yellow-700",  bar: "bg-yellow-500" },
  neutral:     { emoji: "😐", label: "Neutral",     color: "text-gray-600",    bar: "bg-gray-400" },
};

export const STRATEGIES: Record<StrategyId, StrategyInfo> = {
  mediapipe: {
    id: "mediapipe",
    name: "Strategy A — MediaPipe Blendshapes",
    shortName: "MediaPipe",
    description:
      "Google Face Landmarker blend shapes + head pose + eye openness. Rule-based mapping to learning emotions.",
    pros: ["Fast (~15 FPS)", "Runs fully local", "Good for tired / inattentive via geometry"],
    cons: ["Not a trained emotion model", "Lighting sensitive"],
  },
  faceapi: {
    id: "faceapi",
    name: "Strategy B — face-api.js CNN",
    shortName: "face-api.js",
    description:
      "Pretrained FaceExpressionNet (CNN) on detected face crops. Classic 7 expressions remapped to lab labels.",
    pros: ["Trained on expressions", "Strong on happy / sad / angry", "Simple pipeline"],
    cons: ["Slower (~2 FPS)", "Weak on bored / tired / inattentive"],
  },
  hybrid: {
    id: "hybrid",
    name: "Strategy C — Hybrid Fusion",
    shortName: "Hybrid",
    description:
      "MediaPipe geometry + face-api CNN + 3s sliding window smoothing. Most stable probabilities.",
    pros: ["Smoothest output", "Best all-round balance", "Confidence-based"],
    cons: ["Loads both model stacks", "Slightly higher CPU"],
  },
};

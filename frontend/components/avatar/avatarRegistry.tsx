import { AvatarFace, type AvatarFaceProps } from "./AvatarFace";

/**
 * Fixed gallery of 12 cute illustrated avatars — soft pastels, varied skin
 * tones and hair. IDs are stable (`user.avatar`); never rename existing ids.
 */
export const AVATAR_REGISTRY: Record<string, AvatarFaceProps> = {
  avatar_1: {
    skin: "#f6d0b0",
    hair: "#3b2418",
    hairStyle: "short",
    shirt: "#38bdf8",
    bgFrom: "#e0f2fe",
    bgTo: "#7dd3fc",
  },
  avatar_2: {
    skin: "#ebbc98",
    hair: "#1c1410",
    hairStyle: "curly",
    shirt: "#fb923c",
    bgFrom: "#ffedd5",
    bgTo: "#fdba74",
  },
  avatar_3: {
    skin: "#9a6232",
    hair: "#140a06",
    hairStyle: "short",
    accessory: "glasses",
    shirt: "#34d399",
    bgFrom: "#d1fae5",
    bgTo: "#6ee7b7",
  },
  avatar_4: {
    skin: "#ffe4c9",
    hair: "#8b5a32",
    hairStyle: "long",
    shirt: "#f472b6",
    bgFrom: "#fce7f3",
    bgTo: "#f9a8d4",
  },
  avatar_5: {
    skin: "#d09456",
    hair: "#24160f",
    hairStyle: "ponytail",
    shirt: "#818cf8",
    bgFrom: "#e0e7ff",
    bgTo: "#a5b4fc",
  },
  avatar_6: {
    skin: "#fae0c4",
    hair: "#d4a017",
    hairStyle: "curly",
    shirt: "#facc15",
    bgFrom: "#fef9c3",
    bgTo: "#fde047",
  },
  avatar_7: {
    skin: "#b5744a",
    hair: "#0f766e",
    hairStyle: "hijab",
    shirt: "#2dd4bf",
    bgFrom: "#ccfbf1",
    bgTo: "#5eead4",
  },
  avatar_8: {
    skin: "#f6d0b0",
    hair: "#2563eb",
    hairStyle: "hijab",
    accessory: "glasses",
    shirt: "#60a5fa",
    bgFrom: "#dbeafe",
    bgTo: "#93c5fd",
  },
  avatar_9: {
    skin: "#ebbc98",
    hair: "#2b2b2b",
    hairStyle: "bald",
    accessory: "glasses",
    shirt: "#f97316",
    bgFrom: "#ffedd5",
    bgTo: "#fdba74",
  },
  avatar_10: {
    skin: "#9a6232",
    hair: "#2a1a10",
    hairStyle: "ponytail",
    shirt: "#4ade80",
    bgFrom: "#dcfce7",
    bgTo: "#86efac",
  },
  avatar_11: {
    skin: "#ffe4c9",
    hair: "#1f2937",
    hairStyle: "short",
    shirt: "#0ea5e9",
    bgFrom: "#e0f2fe",
    bgTo: "#7dd3fc",
  },
  avatar_12: {
    skin: "#d09456",
    hair: "#4a2814",
    hairStyle: "long",
    accessory: "glasses",
    shirt: "#fb7185",
    bgFrom: "#ffe4e6",
    bgTo: "#fda4af",
  },
};

export const AVATAR_IDS = Object.keys(AVATAR_REGISTRY);

export function AvatarThumb({ id, size = 64 }: { id: string; size?: number }) {
  const preset = AVATAR_REGISTRY[id];
  if (!preset) return null;
  return <AvatarFace {...preset} size={size} />;
}

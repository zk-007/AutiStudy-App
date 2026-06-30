import type { ChatMessage, GenerateVisualAidResponse } from "@/lib/api/client";

const CLEARED_VISUALS = {
  image_url: null,
  math_steps: null,
  emoji_counting: null,
  factor_tree: null,
  fraction_bar: null,
  number_line: null,
  bar_chart: null,
  percentage_bar: null,
  times_table: null,
  geometry: null,
  ratio: null,
} as const;

/** Merge a visual-aid API response into a chat message bubble. */
export function mergeVisualAidIntoMessage(
  message: ChatMessage,
  result: GenerateVisualAidResponse,
): ChatMessage {
  const base = { ...message, ...CLEARED_VISUALS };
  switch (result.kind) {
    case "image":
      return { ...base, image_url: result.image_url };
    case "emoji_counting":
      return { ...base, emoji_counting: result.emoji_counting };
    case "factor_tree":
      return { ...base, factor_tree: result.factor_tree };
    case "fraction_bar":
      return { ...base, fraction_bar: result.fraction_bar };
    case "number_line":
      return { ...base, number_line: result.number_line };
    case "bar_chart":
      return { ...base, bar_chart: result.bar_chart };
    case "percentage_bar":
      return { ...base, percentage_bar: result.percentage_bar };
    case "times_table":
      return { ...base, times_table: result.times_table };
    case "geometry":
      return { ...base, geometry: result.geometry };
    case "ratio":
      return { ...base, ratio: result.ratio };
    case "math_steps":
      return { ...base, math_steps: result.math_steps };
  }
}

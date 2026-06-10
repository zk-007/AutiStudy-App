import type { LabEmotion } from "../types";
import { LAB_EMOTIONS } from "../types";

/**
 * Sliding-window smoother for emotion probabilities.
 */
export class LabSignalBuffer {
  private samples: Array<{ t: number; scores: Record<LabEmotion, number> }> = [];
  private blinkTimes: number[] = [];

  constructor(private windowMs = 3000) {}

  push(scores: Record<LabEmotion, number>, timestamp = Date.now(), blink = false) {
    this.samples.push({ t: timestamp, scores: { ...scores } });
    if (blink) this.blinkTimes.push(timestamp);
    const cutoff = timestamp - this.windowMs;
    this.samples = this.samples.filter((s) => s.t >= cutoff);
    this.blinkTimes = this.blinkTimes.filter((t) => t >= cutoff);
  }

  get blinkRatePerMin(): number {
    if (this.samples.length < 2) return 0;
    const span = (this.samples[this.samples.length - 1].t - this.samples[0].t) / 60000;
    if (span < 0.05) return 0;
    return this.blinkTimes.length / span;
  }

  getSmoothed(): Record<LabEmotion, number> {
    if (this.samples.length === 0) {
      return Object.fromEntries(LAB_EMOTIONS.map((k) => [k, k === "neutral" ? 1 : 0])) as Record<
        LabEmotion,
        number
      >;
    }
    const out = Object.fromEntries(LAB_EMOTIONS.map((k) => [k, 0])) as Record<LabEmotion, number>;
    for (const s of this.samples) {
      for (const k of LAB_EMOTIONS) {
        out[k] += s.scores[k] ?? 0;
      }
    }
    const n = this.samples.length;
    for (const k of LAB_EMOTIONS) out[k] /= n;
    return out;
  }

  /** How long hybrid distress emotions have stayed above threshold (ms). */
  stableDistressMs(threshold: number): number {
    if (this.samples.length < 2) return 0;
    const newest = this.samples[this.samples.length - 1].t;
    let oldestStable = newest;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const s = this.samples[i].scores;
      const distress = Math.max(
        s.sad ?? 0,
        s.tired ?? 0,
        s.confused ?? 0,
        s.frustrated ?? 0,
        s.bored ?? 0,
        s.inattentive ?? 0,
      );
      if (distress >= threshold) oldestStable = this.samples[i].t;
      else break;
    }
    return newest - oldestStable;
  }

  clear() {
    this.samples = [];
    this.blinkTimes = [];
  }
}

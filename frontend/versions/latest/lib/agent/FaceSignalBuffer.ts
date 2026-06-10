/**
 * FaceSignalBuffer — Sliding window over raw face signals
 * ========================================================
 *
 * Key design: NEVER decide from a single frame.
 * Maintain a rolling buffer of the last WINDOW_MS milliseconds
 * and expose averaged values for the EngagementAnalyzer.
 *
 * Also tracks blink detection (EAR dips below threshold = blink event).
 */

import type { FaceSignal, FaceSignalAverage } from "./types";

const WINDOW_MS = 8000;        // 8-second sliding window
const BLINK_EAR_THRESHOLD = 0.16; // EAR below this = eye closed (blink)
const MIN_BLINK_GAP_MS = 100;  // debounce: ignore blinks closer than 100ms

export class FaceSignalBuffer {
  private signals: FaceSignal[] = [];
  private blinkTimestamps: number[] = [];
  private lastBlinkTime = 0;
  private prevEarAboveThreshold = true; // for edge detection

  // ── Add one frame's signal ────────────────────────────────────────────────
  add(signal: FaceSignal): void {
    const now = signal.timestamp;

    // Blink detection: EAR crosses below threshold (falling edge)
    const earBelow = signal.ear < BLINK_EAR_THRESHOLD;
    if (earBelow && this.prevEarAboveThreshold && now - this.lastBlinkTime > MIN_BLINK_GAP_MS) {
      this.blinkTimestamps.push(now);
      this.lastBlinkTime = now;
      signal = { ...signal, blinkDetected: true };
    }
    this.prevEarAboveThreshold = !earBelow;

    this.signals.push(signal);

    // Purge old signals outside the window
    this.signals = this.signals.filter((s) => now - s.timestamp < WINDOW_MS);
    this.blinkTimestamps = this.blinkTimestamps.filter((t) => now - t < 60_000); // keep 1 min for bpm
  }

  // ── Compute averages over the current window ──────────────────────────────
  get average(): FaceSignalAverage | null {
    const n = this.signals.length;
    if (n < 5) return null; // need at least 5 frames (~160ms) to be meaningful

    const sum = this.signals.reduce(
      (acc, s) => ({
        browDown:    acc.browDown    + s.browDown,
        browInnerUp: acc.browInnerUp + s.browInnerUp,
        smile:       acc.smile       + s.smile,
        cheekSquint: acc.cheekSquint + s.cheekSquint,
        jawOpen:     acc.jawOpen     + s.jawOpen,
        eyeBlink:    acc.eyeBlink    + s.eyeBlink,
        eyeWide:     acc.eyeWide     + s.eyeWide,
        mouthFrown:  acc.mouthFrown  + s.mouthFrown,
        ear:         acc.ear         + s.ear,
        headYaw:     acc.headYaw     + Math.abs(s.headYaw),   // abs: either side = looking away
        headPitch:   acc.headPitch   + Math.abs(s.headPitch),
        facePresent: acc.facePresent + (s.facePresent ? 1 : 0),
      }),
      {
        browDown: 0, browInnerUp: 0, smile: 0, cheekSquint: 0,
        jawOpen: 0, eyeBlink: 0, eyeWide: 0, mouthFrown: 0,
        ear: 0, headYaw: 0, headPitch: 0, facePresent: 0,
      }
    );

    const div = (x: number) => x / n;

    // Blink rate: blinks in the last 60 seconds × (60 / elapsed seconds)
    const oldest = this.signals[0].timestamp;
    const newest = this.signals[n - 1].timestamp;
    const windowDurationMs = newest - oldest;
    const windowDurationSec = Math.max(1, windowDurationMs / 1000);
    const blinksInWindow = this.blinkTimestamps.filter(
      (t) => t >= oldest && t <= newest
    ).length;
    const blinkRate = (blinksInWindow / windowDurationSec) * 60; // blinks per minute

    return {
      browDown:           div(sum.browDown),
      browInnerUp:        div(sum.browInnerUp),
      smile:              div(sum.smile),
      cheekSquint:        div(sum.cheekSquint),
      jawOpen:            div(sum.jawOpen),
      eyeBlink:           div(sum.eyeBlink),
      eyeWide:            div(sum.eyeWide),
      mouthFrown:         div(sum.mouthFrown),
      ear:                div(sum.ear),
      headYaw:            div(sum.headYaw),
      headPitch:          div(sum.headPitch),
      blinkRate,
      facePresenceRatio:  div(sum.facePresent),
      sampleCount:        n,
      windowDurationMs,
    };
  }

  // ── How long has the dominant pattern been stable? ────────────────────────
  // Used by TutorPolicyEngine to require stable confusion before acting
  stableDurationMs(testFn: (s: FaceSignal) => boolean): number {
    // Walk backwards from newest until testFn returns false
    const sigs = [...this.signals].reverse();
    let stable = 0;
    for (const s of sigs) {
      if (testFn(s)) stable++;
      else break;
    }
    if (stable < 2) return 0;
    const newest = this.signals[this.signals.length - 1].timestamp;
    const oldestStable = this.signals[this.signals.length - stable].timestamp;
    return newest - oldestStable;
  }

  get isEmpty(): boolean {
    return this.signals.length === 0;
  }

  get recentFacePresent(): boolean {
    if (this.signals.length === 0) return false;
    const recent = this.signals.slice(-10); // last ~330ms
    return recent.some((s) => s.facePresent);
  }

  clear(): void {
    this.signals = [];
    this.blinkTimestamps = [];
  }
}

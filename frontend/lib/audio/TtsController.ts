import { prepareTtsAudio } from "@/lib/audio/playTtsAudio";

export type TtsPlaybackState = "idle" | "loading" | "playing" | "paused" | "stopped";

export type TtsFetchFn = (
  text: string,
  language: "en" | "ur",
) => Promise<{ audio_base64: string; mime_type: string }>;

export type TtsPlayOptions = { playbackRate?: number; gain?: number; volume?: number };

/**
 * Central TTS playback controller — Gap 6 (Play / Pause / Stop / Replay).
 * One active clip at a time; keeps last audio in memory for replay after pause/stop.
 */
export class TtsController {
  private audio: HTMLAudioElement | null = null;
  private state: TtsPlaybackState = "idle";
  private listeners = new Set<() => void>();
  private endWaiters = new Set<() => void>();

  activeIndex: number | null = null;
  lastText = "";
  lastLanguage: "en" | "ur" = "en";
  lastOptions: TtsPlayOptions = {};
  /** Voice-note panel stays open after Stop until user dismisses with ✕. */
  panelOpen = false;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): TtsPlaybackState {
    return this.state;
  }

  isActive(index: number): boolean {
    return this.activeIndex === index && this.state !== "idle";
  }

  isPanelVisible(index: number): boolean {
    return this.activeIndex === index && this.panelOpen;
  }

  getPanelOpen(): boolean {
    return this.panelOpen;
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private setState(next: TtsPlaybackState) {
    if (this.state === next) return;
    this.state = next;
    this.notify();
    if (next === "idle") {
      this.endWaiters.forEach((fn) => fn());
      this.endWaiters.clear();
    }
  }

  private clearActiveIndex() {
    if (this.activeIndex === null) return;
    this.activeIndex = null;
    this.notify();
  }

  private attachHandlers(audio: HTMLAudioElement) {
    audio.onloadedmetadata = () => this.notify();
    audio.ontimeupdate = () => this.notify();
    audio.onended = () => {
      if (this.activeIndex === null) {
        this.setState("idle");
        return;
      }
      this.panelOpen = true;
      this.setState("stopped");
    };
    audio.onerror = () => {
      this.clearActiveIndex();
      this.panelOpen = false;
      this.setState("idle");
    };
  }

  getProgress(): { currentTime: number; duration: number } {
    return {
      currentTime: this.audio?.currentTime ?? 0,
      duration: Number.isFinite(this.audio?.duration) ? (this.audio?.duration ?? 0) : 0,
    };
  }

  seek(ratio: number) {
    if (!this.audio || !Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    this.audio.currentTime = clamped * this.audio.duration;
    this.notify();
  }

  private async loadAudio(
    text: string,
    language: "en" | "ur",
    fetchFn: TtsFetchFn,
    options: TtsPlayOptions,
  ): Promise<HTMLAudioElement> {
    const { audio_base64, mime_type } = await fetchFn(text, language);
    const audio = new Audio(`data:${mime_type};base64,${audio_base64}`);
    prepareTtsAudio(audio, options);
    this.attachHandlers(audio);
    return audio;
  }

  /** Start (or restart) narration for a message bubble index. */
  async play(
    index: number,
    text: string,
    language: "en" | "ur",
    fetchFn: TtsFetchFn,
    options: TtsPlayOptions = {},
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.disposeAudio();
    this.activeIndex = index;
    this.panelOpen = true;
    this.lastText = trimmed;
    this.lastLanguage = language;
    this.lastOptions = options;
    this.setState("loading");

    try {
      this.audio = await this.loadAudio(trimmed, language, fetchFn, options);
      await this.audio.play();
      this.setState("playing");
    } catch {
      this.disposeAudio();
      this.clearActiveIndex();
      this.setState("idle");
    }
  }

  /** Ladder / adaptation read-aloud — always user-initiated by help flow. */
  async speakForFlow(
    text: string,
    language: "en" | "ur",
    fetchFn: TtsFetchFn,
    options: TtsPlayOptions = {},
  ): Promise<void> {
    await this.play(-1, text, language, fetchFn, options);
    if (this.state === "idle") return;
    return new Promise<void>((resolve) => {
      const unsub = this.subscribe(() => {
        if (this.state === "idle") {
          unsub();
          resolve();
        }
      });
    });
  }

  pause() {
    if (this.audio && this.state === "playing") {
      this.audio.pause();
      this.setState("paused");
    }
  }

  resume() {
    if (this.audio && (this.state === "paused" || this.state === "stopped")) {
      void this.audio.play().then(() => this.setState("playing")).catch(() => {
        this.disposeAudio();
        this.clearActiveIndex();
        this.panelOpen = false;
        this.setState("idle");
      });
    }
  }

  /** Stop playback but keep the voice-note panel visible. */
  stop() {
    if (this.state === "idle" && this.activeIndex === null && !this.audio) return;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (this.activeIndex !== null) {
      this.panelOpen = true;
      this.setState("stopped");
      return;
    }
    this.setState("idle");
  }

  /** User closed the voice-note panel — can reopen via Read Aloud. */
  dismissPanel() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.panelOpen = false;
    this.clearActiveIndex();
    this.setState("idle");
  }

  async replay(fetchFn: TtsFetchFn) {
    this.panelOpen = true;
    if (this.audio) {
      this.audio.currentTime = 0;
      try {
        await this.audio.play();
        this.setState("playing");
        return;
      } catch {
        /* fall through to re-fetch */
      }
    }
    if (!this.lastText) return;
    await this.play(
      this.activeIndex ?? -1,
      this.lastText,
      this.lastLanguage,
      fetchFn,
      this.lastOptions,
    );
  }

  togglePlayPause() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
  }

  dispose() {
    this.disposeAudio();
    this.listeners.clear();
    this.endWaiters.clear();
    this.state = "idle";
    this.activeIndex = null;
    this.panelOpen = false;
  }

  private disposeAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
    }
  }
}

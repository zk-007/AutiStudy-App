/**
 * Prepare TTS audio element (volume, rate, optional gain boost).
 */
export function prepareTtsAudio(
  audio: HTMLAudioElement,
  options?: { playbackRate?: number; gain?: number; volume?: number },
): void {
  audio.volume = Math.min(1, Math.max(0, options?.volume ?? 1));
  audio.playbackRate = options?.playbackRate ?? 1;

  const gainValue = options?.gain ?? 1.4;
  if (gainValue > 1 && typeof window !== "undefined") {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(gain);
      gain.connect(ctx.destination);
      void ctx.resume();
    } catch {
      // Fall back to plain HTMLAudioElement volume
    }
  }
}

/**
 * Play TTS with max volume and optional gain boost (read-aloud / agent voice).
 */
export async function playTtsAudio(
  audio: HTMLAudioElement,
  options?: { playbackRate?: number; gain?: number },
): Promise<void> {
  prepareTtsAudio(audio, options);

  return new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play();
  });
}

/**
 * Play TTS with max volume and optional gain boost (read-aloud / agent voice).
 */
export async function playTtsAudio(
  audio: HTMLAudioElement,
  options?: { playbackRate?: number; gain?: number },
): Promise<void> {
  audio.volume = 1;
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
      await ctx.resume();
    } catch {
      // Fall back to plain HTMLAudioElement volume
    }
  }

  return new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play();
  });
}

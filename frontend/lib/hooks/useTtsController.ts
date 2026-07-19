"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { TtsController } from "@/lib/audio/TtsController";
import { chatApi } from "@/lib/api/client";
import { useSettings } from "@/lib/settings/SettingsContext";

type TtsSnapshot = {
  state: ReturnType<TtsController["getState"]>;
  activeIndex: number | null;
  currentTime: number;
  duration: number;
  panelOpen: boolean;
};

const SERVER_SNAPSHOT: TtsSnapshot = {
  state: "idle",
  activeIndex: null,
  currentTime: 0,
  duration: 0,
  panelOpen: false,
};

export function useTtsController(locale: "en" | "ur") {
  const controllerRef = useRef<TtsController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new TtsController();
  }
  const controller = controllerRef.current;
  const { settings } = useSettings();

  const language = locale === "ur" ? "ur" : "en";
  const snapshotRef = useRef<TtsSnapshot>(SERVER_SNAPSHOT);

  const subscribe = useCallback(
    (onStoreChange: () => void) => controller.subscribe(onStoreChange),
    [controller],
  );
  const getSnapshot = useCallback((): TtsSnapshot => {
    const state = controller.getState();
    const activeIndex = controller.activeIndex;
    const { currentTime, duration } = controller.getProgress();
    const panelOpen = controller.getPanelOpen();
    const cached = snapshotRef.current;
    if (
      cached.state === state &&
      cached.activeIndex === activeIndex &&
      cached.panelOpen === panelOpen &&
      Math.abs(cached.currentTime - currentTime) < 0.05 &&
      cached.duration === duration
    ) {
      return cached;
    }
    const next = { state, activeIndex, currentTime, duration, panelOpen };
    snapshotRef.current = next;
    return next;
  }, [controller]);
  const getServerSnapshot = useCallback((): TtsSnapshot => SERVER_SNAPSHOT, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const fetchTts = useCallback(
    (text: string, lang: "en" | "ur") => chatApi.speak(text, lang, settings.voiceNarrator),
    [settings.voiceNarrator],
  );

  const play = useCallback(
    (index: number, text: string) =>
      controller.play(index, text, language, fetchTts, {
        playbackRate: settings.voiceSpeed,
        gain: 1.35,
        volume: settings.voiceVolume,
      }),
    [controller, fetchTts, language, settings.voiceSpeed, settings.voiceVolume],
  );

  const speakForFlow = useCallback(
    (text: string, index?: number) => {
      const idx = index ?? -1;
      return controller.play(idx, text, language, fetchTts, {
        playbackRate: settings.voiceSpeed * 1.05,
        gain: 1.45,
        volume: settings.voiceVolume,
      });
    },
    [controller, fetchTts, language, settings.voiceSpeed, settings.voiceVolume],
  );

  const pause = useCallback(() => controller.pause(), [controller]);
  const resume = useCallback(() => controller.resume(), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const dismissPanel = useCallback(() => controller.dismissPanel(), [controller]);
  const replay = useCallback(() => controller.replay(fetchTts), [controller, fetchTts]);
  const seek = useCallback((ratio: number) => controller.seek(ratio), [controller]);

  const isActive = useCallback(
    (index: number) => controller.isActive(index),
    [controller],
  );

  const isPanelVisible = useCallback(
    (index: number) => controller.isPanelVisible(index),
    [controller],
  );

  useEffect(() => () => controller.dispose(), [controller]);

  return {
    state: snapshot.state,
    activeIndex: snapshot.activeIndex,
    currentTime: snapshot.currentTime,
    duration: snapshot.duration,
    panelOpen: snapshot.panelOpen,
    play,
    speakForFlow,
    pause,
    resume,
    stop,
    dismissPanel,
    replay,
    seek,
    isActive,
    isPanelVisible,
  };
}

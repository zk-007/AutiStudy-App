"use client";

import { Loader2, Pause, Play, RotateCcw, Square, Volume2, X } from "lucide-react";
import type { TtsPlaybackState } from "@/lib/audio/TtsController";

export interface AudioControlLabels {
  play: string;
  pause: string;
  stop: string;
  replay: string;
  loading: string;
}

interface AudioControlsProps {
  state: TtsPlaybackState;
  isActive: boolean;
  /** Voice-note panel open (stays visible after Stop until ✕). */
  panelOpen?: boolean;
  labels: AudioControlLabels;
  currentTime?: number;
  duration?: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onReplay: () => void;
  onDismiss?: () => void;
  onSeek?: (ratio: number) => void;
}

const btnBase =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioControls({
  state,
  isActive,
  panelOpen = false,
  labels,
  currentTime = 0,
  duration = 0,
  onPlay,
  onPause,
  onStop,
  onReplay,
  onDismiss,
  onSeek,
}: AudioControlsProps) {
  const active = isActive || state === "loading";
  const showPanel = panelOpen || active;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  if (state === "loading" && showPanel) {
    return (
      <div className="relative w-full min-w-[220px] rounded-2xl border border-glacier-200 bg-white/90 px-3 py-2.5">
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-2 right-2 rounded-full p-1 text-deep-soft hover:bg-glacier-50 hover:text-deep"
            aria-label="Close voice player"
          >
            <X size={14} />
          </button>
        )}
        <button type="button" disabled className={`${btnBase} bg-white/80 border-glacier-200 text-deep-soft`}>
          <Loader2 size={13} className="animate-spin" />
          {labels.loading}
        </button>
      </div>
    );
  }

  if (!showPanel) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className={`${btnBase} bg-white/80 hover:bg-white border-glacier-200 text-deep-soft hover:text-deep`}
      >
        <Volume2 size={13} />
        {labels.play}
      </button>
    );
  }

  return (
    <div className="relative w-full min-w-[220px] rounded-2xl border border-glacier-200 bg-white/90 px-3 py-2.5 space-y-2">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-2 right-2 rounded-full p-1 text-deep-soft hover:bg-glacier-50 hover:text-deep"
          aria-label="Close voice player"
        >
          <X size={14} />
        </button>
      )}
      <div className="flex items-center gap-2 pr-6">
        {state === "playing" ? (
          <button
            type="button"
            onClick={onPause}
            className={`${btnBase} bg-glacier-500 border-glacier-500 text-white`}
          >
            <Pause size={13} />
            {labels.pause}
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className={`${btnBase} bg-glacier-500 border-glacier-500 text-white`}
          >
            <Play size={13} />
            {labels.play}
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          className={`${btnBase} bg-white/80 hover:bg-white border-glacier-200 text-deep-soft hover:text-deep`}
        >
          <Square size={13} />
          {labels.stop}
        </button>
        <button
          type="button"
          onClick={onReplay}
          className={`${btnBase} bg-white/80 hover:bg-white border-glacier-200 text-deep-soft hover:text-deep`}
        >
          <RotateCcw size={13} />
          {labels.replay}
        </button>
      </div>
      {onSeek && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-deep-soft tabular-nums w-8">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(e) => onSeek(Number(e.target.value) / 1000)}
            className="flex-1 h-1.5 accent-glacier-500 cursor-pointer"
            aria-label="Audio progress"
          />
          <span className="text-[10px] font-semibold text-deep-soft tabular-nums w-8 text-right">
            {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}

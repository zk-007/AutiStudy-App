"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Keyboard, Loader2 } from "lucide-react";
import type { InputMode } from "@/lib/classroom/types";

interface ClassroomInputProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

type ListenStatus = "idle" | "readying" | "listening" | "heard" | "error";

export function ClassroomInput({
  mode,
  onModeChange,
  onSubmit,
  disabled = false,
  loading = false,
  placeholder = "Type your question here...",
}: ClassroomInputProps) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [heardPreview, setHeardPreview] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const onSubmitRef = useRef(onSubmit);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    setSpeechSupported(!!SR);
  }, []);

  /** Pre-warm mic permission when user picks Speak — one less tap later. */
  useEffect(() => {
    if (mode !== "speak" || !navigator.mediaDevices?.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => {});
  }, [mode]);

  const cleanupRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    recognitionRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    if (disabled || loading || startingRef.current) return;

    const SR =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : null;
    if (!SR) {
      setStatus("error");
      setStatusMessage("Speech not supported — please use Type mode.");
      return;
    }

    startingRef.current = true;
    setStatus("readying");
    setStatusMessage("Getting microphone ready...");
    setHeardPreview("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      startingRef.current = false;
      setListening(false);
      setStatus("error");
      setStatusMessage("Please allow microphone access in your browser.");
      return;
    }

    cleanupRecognition();

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    let submitted = false;

    rec.onstart = () => {
      startingRef.current = false;
      setListening(true);
      setStatus("listening");
      setStatusMessage("I'm listening — ask your question now!");
    };

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const chunk = ev.results[i]?.[0]?.transcript ?? "";
        if (ev.results[i]?.isFinal) finalText += chunk;
        else interim += chunk;
      }
      const preview = (finalText || interim).trim();
      if (preview) setHeardPreview(preview);

      if (finalText.trim() && !submitted) {
        submitted = true;
        setStatus("heard");
        setStatusMessage(`I heard: "${finalText.trim()}"`);
        onSubmitRef.current(finalText.trim());
      }
    };

    rec.onerror = (ev: Event) => {
      startingRef.current = false;
      setListening(false);
      const code = (ev as SpeechRecognitionErrorEvent).error;
      if (code === "aborted") return;
      setStatus("error");
      if (code === "no-speech") {
        setStatusMessage("I didn't catch that. Tap once and speak clearly.");
      } else if (code === "not-allowed") {
        setStatusMessage("Microphone blocked — check browser permissions.");
      } else {
        setStatusMessage("Couldn't listen. Tap the mic once more.");
      }
    };

    rec.onend = () => {
      startingRef.current = false;
      setListening(false);
      recognitionRef.current = null;
      if (!submitted) {
        setStatus((prev) => (prev === "error" ? "error" : "idle"));
        setStatusMessage((prev) =>
          prev.startsWith("I heard") ? prev : "Tap the mic and ask your question.",
        );
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
    } catch {
      await new Promise((r) => setTimeout(r, 250));
      try {
        rec.start();
      } catch {
        startingRef.current = false;
        setStatus("error");
        setStatusMessage("Tap the mic once more to start listening.");
      }
    }
  }, [cleanupRecognition, disabled, loading]);

  const stopListening = useCallback(() => {
    cleanupRecognition();
    startingRef.current = false;
    setListening(false);
    setStatus("idle");
    setStatusMessage("Stopped listening.");
  }, [cleanupRecognition]);

  useEffect(() => () => cleanupRecognition(), [cleanupRecognition]);

  const handleSubmit = useCallback(() => {
    const q = text.trim();
    if (!q || disabled || loading) return;
    onSubmit(q);
    setText("");
  }, [text, disabled, loading, onSubmit]);

  const handleModeType = () => {
    stopListening();
    onModeChange("type");
  };

  const handleModeSpeak = () => {
    onModeChange("speak");
    setStatus("idle");
    setStatusMessage("Tap the big mic button and ask your question.");
  };

  return (
    <div className="rounded-2xl glass-strong p-4 shadow-soft">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={handleModeType}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            mode === "type"
              ? "bg-glacier-500 text-white"
              : "bg-glacier-100 text-deep-soft hover:bg-glacier-200"
          }`}
        >
          <Keyboard size={14} />
          Type
        </button>
        <button
          type="button"
          onClick={handleModeSpeak}
          disabled={!speechSupported}
          title={speechSupported ? "Speak your question" : "Speech not supported in this browser"}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            mode === "speak"
              ? "bg-glacier-500 text-white"
              : "bg-glacier-100 text-deep-soft hover:bg-glacier-200 disabled:opacity-40"
          }`}
        >
          <Mic size={14} />
          Speak
        </button>
      </div>

      {mode === "type" ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={placeholder}
            disabled={disabled || loading}
            className="flex-1 rounded-xl border border-glacier-200 bg-white/80 px-4 py-3 text-deep placeholder:text-deep-soft/50 focus:outline-none focus:ring-2 focus:ring-glacier-400"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || loading || !text.trim()}
            className="rounded-xl bg-gradient-to-br from-glacier-500 to-deep text-white px-4 py-3 font-bold shadow-soft disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            Ask
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={disabled || loading || !speechSupported || status === "readying"}
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-deep transition-all touch-manipulation ${
              listening
                ? "bg-rose-500 text-white ring-4 ring-rose-200"
                : status === "readying"
                  ? "bg-glacier-300 text-white"
                  : "bg-gradient-to-br from-glacier-500 to-deep text-white hover:scale-105 active:scale-95"
            } disabled:opacity-50`}
            aria-label={listening ? "Stop listening" : "Start listening"}
          >
            {status === "readying" ? (
              <Loader2 size={36} className="animate-spin" />
            ) : listening ? (
              <MicOff size={36} />
            ) : (
              <Mic size={36} />
            )}
          </button>
          <p className="text-sm text-deep-soft text-center max-w-sm">
            {disabled
              ? "Wait — teacher is explaining..."
              : statusMessage || "Tap once, then ask your question clearly."}
          </p>
          {heardPreview && status === "listening" ? (
            <p className="text-xs text-glacier-600 font-medium">Hearing: {heardPreview}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    isFinal: boolean;
    length: number;
    [index: number]: { transcript: string };
  };
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

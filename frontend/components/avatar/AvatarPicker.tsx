"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { AVATAR_IDS, AvatarThumb } from "./avatarRegistry";
import { API_BASE, getToken, ApiError } from "@/lib/api/client";

interface AvatarPickerProps {
  currentAvatar?: string | null;
  onSaved: (avatarId: string) => void;
  labelPick: string;
  labelSaving: string;
  labelError: string;
}

export function AvatarPicker({
  currentAvatar,
  onSaved,
  labelPick,
  labelSaving,
  labelError,
}: AvatarPickerProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (avatarId: string) => {
    if (saving || avatarId === currentAvatar) return;
    setSaving(avatarId);
    setError(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/users/me/avatar`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ avatar: avatarId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new ApiError(res.status, d?.detail ?? labelError);
      }
      onSaved(avatarId);
    } catch {
      setError(labelError);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <p className="text-xs text-deep-soft mb-3">{labelPick}</p>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
        {AVATAR_IDS.map((id) => {
          const active = id === currentAvatar;
          const isSaving = saving === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              disabled={!!saving}
              aria-label={`Avatar ${id}`}
              className={`relative rounded-2xl p-1.5 transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:cursor-wait ${
                active
                  ? "ring-2 ring-sky-500 bg-sky-50 shadow-soft"
                  : "ring-1 ring-glacier-200 bg-white/80 hover:ring-sky-300"
              }`}
            >
              <AvatarThumb id={id} size={56} />
              {active && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white shadow">
                  <Check size={12} />
                </span>
              )}
              {isSaving && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
                  <Loader2 size={16} className="animate-spin text-sky-600" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {saving && (
        <p className="mt-2 text-xs text-deep-muted">{labelSaving}</p>
      )}
      {error && (
        <p className="mt-2 text-xs text-rose-600">{error}</p>
      )}
    </div>
  );
}

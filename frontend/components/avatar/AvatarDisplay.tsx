"use client";

import { motion } from "framer-motion";
import { AVATAR_REGISTRY, AvatarThumb } from "./avatarRegistry";

interface AvatarDisplayProps {
  avatarId?: string | null;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Shows the student's chosen illustrated avatar; falls back to the original
 * initial-letter circle for accounts that haven't picked one yet (Part B #2).
 */
export function AvatarDisplay({ avatarId, name, size = 64, className = "" }: AvatarDisplayProps) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const hasAvatar = !!avatarId && !!AVATAR_REGISTRY[avatarId];

  return (
    <motion.div
      initial={{ scale: 0.8, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center rounded-full overflow-hidden shadow-soft ring-2 ring-white/80 ${
        hasAvatar
          ? "shadow-[0_8px_20px_-6px_rgba(15,39,68,0.28)]"
          : "bg-cta"
      } ${className}`}
    >
      {hasAvatar ? (
        <AvatarThumb id={avatarId!} size={size} />
      ) : (
        <span className="font-display text-white font-extrabold" style={{ fontSize: size * 0.4 }}>
          {initial}
        </span>
      )}
    </motion.div>
  );
}

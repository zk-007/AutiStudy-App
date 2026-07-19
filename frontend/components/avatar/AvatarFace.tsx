"use client";

import { useId } from "react";

/**
 * Cute illustrated student avatar — soft face, big shiny eyes, warm blush.
 * No external assets. IDs stay stable via avatarRegistry.
 */

export type HairStyle = "short" | "long" | "curly" | "hijab" | "bald" | "ponytail";
export type Accessory = "none" | "glasses";

export interface AvatarFaceProps {
  skin: string;
  hair: string;
  bgFrom: string;
  bgTo: string;
  hairStyle: HairStyle;
  accessory?: Accessory;
  /** Shirt / sweater color */
  shirt?: string;
  size?: number;
}

function shade(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function AvatarFace({
  skin,
  hair,
  bgFrom,
  bgTo,
  hairStyle,
  accessory = "none",
  shirt = "#475569",
  size = 64,
}: AvatarFaceProps) {
  const uid = useId().replace(/:/g, "");
  const bgGrad = `bg-${uid}`;
  const skinGrad = `skin-${uid}`;
  const hairGrad = `hair-${uid}`;
  const shirtGrad = `shirt-${uid}`;
  const gloss = `gloss-${uid}`;
  const cheekGrad = `cheek-${uid}`;

  const skinDeep = shade(skin, -28);
  const skinLight = shade(skin, 26);
  const hairDeep = shade(hair, -28);
  const hairLight = shade(hair, 22);
  const shirtDeep = shade(shirt, -22);
  const shirtLight = shade(shirt, 18);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      className="block"
    >
      <defs>
        <linearGradient id={bgGrad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bgFrom} />
          <stop offset="100%" stopColor={bgTo} />
        </linearGradient>
        <radialGradient id={gloss} cx="30%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={skinGrad} x1="0.28" y1="0" x2="0.78" y2="1">
          <stop offset="0%" stopColor={skinLight} />
          <stop offset="50%" stopColor={skin} />
          <stop offset="100%" stopColor={skinDeep} />
        </linearGradient>
        <linearGradient id={hairGrad} x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor={hairLight} />
          <stop offset="100%" stopColor={hairDeep} />
        </linearGradient>
        <linearGradient id={shirtGrad} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor={shirtLight} />
          <stop offset="55%" stopColor={shirt} />
          <stop offset="100%" stopColor={shirtDeep} />
        </linearGradient>
        <radialGradient id={cheekGrad} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8fa3" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ff8fa3" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`clip-${uid}`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${uid})`}>
        {/* Soft candy background */}
        <circle cx="32" cy="32" r="32" fill={`url(#${bgGrad})`} />
        <circle cx="32" cy="32" r="32" fill={`url(#${gloss})`} />
        {/* Tiny sparkles in bg */}
        <circle cx="12" cy="14" r="1.2" fill="#ffffff" opacity="0.55" />
        <circle cx="52" cy="18" r="1" fill="#ffffff" opacity="0.45" />
        <circle cx="48" cy="10" r="0.8" fill="#ffffff" opacity="0.4" />

        <ellipse cx="32" cy="58" rx="26" ry="10" fill="#0f2744" opacity="0.06" />

        {/* Back hair / hijab */}
        {hairStyle === "long" && (
          <path
            d="M12 28 C12 11 22 7 32 7 C42 7 52 11 52 28 L53 52 C48 47 45 42 45 34 C45 23 39 17 32 17 C25 17 19 23 19 34 C19 42 16 47 11 52 Z"
            fill={`url(#${hairGrad})`}
          />
        )}
        {hairStyle === "ponytail" && (
          <>
            <ellipse cx="50" cy="28" rx="7" ry="12" fill={`url(#${hairGrad})`} transform="rotate(16 50 28)" />
            <ellipse cx="53" cy="40" rx="5" ry="9" fill={hairDeep} transform="rotate(30 53 40)" />
            <circle cx="49" cy="22" r="3.2" fill={hairLight} opacity="0.5" />
          </>
        )}
        {hairStyle === "hijab" && (
          <path
            d="M9 30 C9 9 22 5 32 5 C42 5 55 9 55 30 L55 58 C48 49 44 42 44 34 C44 21 39 15 32 15 C25 15 20 21 20 34 C20 42 16 49 9 58 Z"
            fill={`url(#${hairGrad})`}
          />
        )}
        {hairStyle === "curly" && (
          <>
            <circle cx="15" cy="25" r="7.5" fill={`url(#${hairGrad})`} />
            <circle cx="49" cy="25" r="7.5" fill={`url(#${hairGrad})`} />
            <circle cx="13" cy="34" r="6" fill={hairDeep} />
            <circle cx="51" cy="34" r="6" fill={hairDeep} />
            <circle cx="18" cy="38" r="4.5" fill={`url(#${hairGrad})`} />
            <circle cx="46" cy="38" r="4.5" fill={`url(#${hairGrad})`} />
          </>
        )}

        {/* Soft sweater */}
        <path
          d="M7 64 C10 47 20 41 32 41 C44 41 54 47 57 64 Z"
          fill={`url(#${shirtGrad})`}
        />
        {/* Cute collar / round neck */}
        <ellipse cx="32" cy="44" rx="7" ry="3.5" fill={skin} opacity="0.95" />

        {/* Neck */}
        <path
          d="M26 39 C27 45 37 45 38 39 L36 43 C34 46 30 46 28 43 Z"
          fill={`url(#${skinGrad})`}
        />

        {/* Ears */}
        {hairStyle !== "hijab" && (
          <>
            <ellipse cx="15" cy="31" rx="3.4" ry="4.4" fill={skinDeep} />
            <ellipse cx="49" cy="31" rx="3.4" ry="4.4" fill={skinDeep} />
            <ellipse cx="15" cy="31" rx="2" ry="2.6" fill={skin} opacity="0.75" />
            <ellipse cx="49" cy="31" rx="2" ry="2.6" fill={skin} opacity="0.75" />
          </>
        )}

        {/* Rounder cute face */}
        <ellipse cx="32" cy="30" rx="16.2" ry="17" fill={`url(#${skinGrad})`} />
        <ellipse cx="32" cy="36" rx="12" ry="8" fill={skinDeep} opacity="0.1" />

        {/* Front hair */}
        {hairStyle === "short" && (
          <path
            d="M15.5 28 C15.5 13 22 9 32 9 C42 9 48.5 13 48.5 28 C46 19 40 15 32 15 C24 15 18 19 15.5 28 Z"
            fill={`url(#${hairGrad})`}
          />
        )}
        {hairStyle === "long" && (
          <path
            d="M16 27 C15.5 12 23 8 32 8 C41 8 48.5 12 48 27 C45 17 39 14 32 14 C25 14 19 17 16 27 Z"
            fill={`url(#${hairGrad})`}
          />
        )}
        {hairStyle === "ponytail" && (
          <path
            d="M16.5 27 C16.5 12 23 9 32 9 C41 9 47.5 12 47.5 27 C45 18 40 15 32 15 C24 15 19 18 16.5 27 Z"
            fill={`url(#${hairGrad})`}
          />
        )}
        {hairStyle === "curly" && (
          <>
            <circle cx="19" cy="15" r="6.2" fill={`url(#${hairGrad})`} />
            <circle cx="27" cy="11" r="6.6" fill={`url(#${hairGrad})`} />
            <circle cx="37" cy="11" r="6.6" fill={`url(#${hairGrad})`} />
            <circle cx="45" cy="15" r="6.2" fill={`url(#${hairGrad})`} />
            <circle cx="23" cy="19" r="5.2" fill={hairDeep} />
            <circle cx="41" cy="19" r="5.2" fill={hairDeep} />
            <circle cx="32" cy="16" r="6" fill={`url(#${hairGrad})`} />
          </>
        )}
        {hairStyle === "hijab" && (
          <>
            <path
              d="M17.5 22 C17.5 13 24 11 32 11 C40 11 46.5 13 46.5 22 L46.5 28 C46.5 19 40 16 32 16 C24 16 17.5 19 17.5 28 Z"
              fill={`url(#${hairGrad})`}
            />
            <path
              d="M20 24 C22 19.5 28 17.5 32 17.5 C36 17.5 42 19.5 44 24"
              stroke={hairLight}
              strokeWidth="1.3"
              fill="none"
              opacity="0.55"
            />
          </>
        )}
        {hairStyle === "bald" && (
          <ellipse cx="32" cy="17" rx="11" ry="4.5" fill="#ffffff" opacity="0.22" />
        )}

        {/* Soft brows */}
        <path
          d="M21.5 25.2 C24.2 23.4 27.8 23.4 30 25.2"
          stroke={hairDeep}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.65"
        />
        <path
          d="M34 25.2 C36.2 23.4 39.8 23.4 42.5 25.2"
          stroke={hairDeep}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          opacity="0.65"
        />

        {/* Big shiny kawaii eyes */}
        <ellipse cx="25.5" cy="30.8" rx="4.2" ry="4.6" fill="#fffefb" />
        <ellipse cx="38.5" cy="30.8" rx="4.2" ry="4.6" fill="#fffefb" />
        <ellipse cx="25.7" cy="31" rx="2.7" ry="2.9" fill="#2a1f4d" />
        <ellipse cx="38.7" cy="31" rx="2.7" ry="2.9" fill="#2a1f4d" />
        <ellipse cx="25.7" cy="31.2" rx="1.7" ry="1.9" fill="#5b4d8a" />
        <ellipse cx="38.7" cy="31.2" rx="1.7" ry="1.9" fill="#5b4d8a" />
        {/* Sparkle highlights */}
        <circle cx="26.9" cy="29.6" r="1.15" fill="#ffffff" />
        <circle cx="39.9" cy="29.6" r="1.15" fill="#ffffff" />
        <circle cx="24.4" cy="32.2" r="0.55" fill="#ffffff" opacity="0.9" />
        <circle cx="37.4" cy="32.2" r="0.55" fill="#ffffff" opacity="0.9" />

        {/* Tiny freckles */}
        <circle cx="21.5" cy="34.5" r="0.55" fill={skinDeep} opacity="0.28" />
        <circle cx="23.2" cy="35.8" r="0.45" fill={skinDeep} opacity="0.22" />
        <circle cx="42.5" cy="34.5" r="0.55" fill={skinDeep} opacity="0.28" />
        <circle cx="40.8" cy="35.8" r="0.45" fill={skinDeep} opacity="0.22" />

        {/* Soft nose */}
        <path
          d="M32 33 C30.6 35.8 33.4 35.8 32 33"
          stroke={skinDeep}
          strokeWidth="1.15"
          strokeLinecap="round"
          fill="none"
          opacity="0.28"
        />

        {/* Warm smile + tiny lip fill */}
        <path
          d="M25.5 38.8 C28.8 42.6 35.2 42.6 38.5 38.8"
          stroke="#e06b7a"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <ellipse cx="32" cy="40.2" rx="3.2" ry="1.1" fill="#f7a0ab" opacity="0.35" />

        {/* Rosy cheeks */}
        <ellipse cx="19.5" cy="35.5" rx="4.2" ry="2.6" fill={`url(#${cheekGrad})`} />
        <ellipse cx="44.5" cy="35.5" rx="4.2" ry="2.6" fill={`url(#${cheekGrad})`} />

        {accessory === "glasses" && (
          <g>
            <rect
              x="19.5"
              y="26.5"
              width="11.5"
              height="9"
              rx="3.5"
              fill="#ffffff"
              fillOpacity="0.28"
              stroke="#334155"
              strokeWidth="1.45"
            />
            <rect
              x="33"
              y="26.5"
              width="11.5"
              height="9"
              rx="3.5"
              fill="#ffffff"
              fillOpacity="0.28"
              stroke="#334155"
              strokeWidth="1.45"
            />
            <path d="M31 31 H33" stroke="#334155" strokeWidth="1.45" strokeLinecap="round" />
            <path d="M19.5 30.5 H16.5" stroke="#334155" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M44.5 30.5 H47.5" stroke="#334155" strokeWidth="1.35" strokeLinecap="round" />
          </g>
        )}
      </g>

      {/* Soft white ring */}
      <circle
        cx="32"
        cy="32"
        r="31"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.65"
        strokeWidth="1.6"
      />
    </svg>
  );
}

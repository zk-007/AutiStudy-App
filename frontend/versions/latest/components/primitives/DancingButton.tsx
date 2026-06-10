"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { ReactNode, MouseEvent } from "react";
import clsx from "clsx";

type Variant = "primary" | "ghost" | "soft";

interface DancingButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
}

export function DancingButton({
  children,
  variant = "primary",
  fullWidth = false,
  className,
  onClick,
  ...rest
}: DancingButtonProps) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-display font-bold text-base tracking-wide transition-shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-glacier-300/60 select-none";

  const variants: Record<Variant, string> = {
    primary:
      "text-white bg-gradient-to-br from-glacier-600 via-glacier-700 to-deep shadow-soft hover:shadow-deep",
    ghost:
      "text-deep bg-white/40 border border-glacier-300/50 backdrop-blur-md hover:bg-white/70",
    soft:
      "text-deep bg-glacier-100 hover:bg-glacier-200 shadow-soft",
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    ripple.style.cssText = `
      position:absolute;
      left:${x}px; top:${y}px;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:rgba(255,255,255,0.45);
      transform:scale(0);
      animation:ripple 0.65s ease-out forwards;
      pointer-events:none;
    `;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);

    onClick?.(e);
  };

  return (
    <>
      <motion.button
        // Explicit rest state — ensures the button is always a straight,
        // unrotated horizontal pill when not being interacted with.
        initial={{ rotate: 0, scale: 1 }}
        animate={{ rotate: 0, scale: 1 }}
        whileHover={{
          // A single playful wiggle on hover, ending cleanly at 0°.
          // No `repeat: Infinity` — so the button never gets stuck mid-rotation.
          scale: 1.04,
          rotate: [0, -2, 2, -1.5, 1.5, 0],
          transition: {
            rotate: { duration: 0.6, ease: "easeInOut" },
            scale: { duration: 0.2 },
          },
        }}
        whileTap={{
          // Tap squashes vertically a touch AND immediately resets rotation,
          // so when the user releases the button is back to a clean straight bar.
          scale: 0.94,
          rotate: 0,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        onClick={handleClick}
        className={clsx(base, variants[variant], fullWidth && "w-full", "overflow-hidden", className)}
        {...rest}
      >
        <span className="relative z-10 flex items-center gap-2">{children}</span>
        {variant === "primary" && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-300 hover:opacity-100"
            style={{
              background:
                "radial-gradient(circle at center, rgba(190,227,248,0.6) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />
        )}
      </motion.button>
      <style jsx global>{`
        @keyframes ripple {
          to {
            transform: scale(2.4);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

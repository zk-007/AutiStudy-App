"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";

type LenisLike = { stop: () => void; start: () => void };

function getLenis(): LenisLike | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __lenis?: LenisLike }).__lenis ?? null;
}

/**
 * Lock page scroll while a modal is open.
 * Stops Lenis smooth-scroll (it hijacks the wheel and ignores overflow:hidden).
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedHtmlOverflow = document.documentElement.style.overflow;
      savedBodyOverflow = document.body.style.overflow;

      getLenis()?.stop();

      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;

        document.documentElement.style.overflow = savedHtmlOverflow;
        document.body.style.overflow = savedBodyOverflow;
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";

        window.scrollTo(0, savedScrollY);
        getLenis()?.start();
      }
    };
  }, [locked]);
}

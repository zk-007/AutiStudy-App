"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";

/**
 * Prevent the page behind a modal from scrolling while the modal is open.
 * Supports nested modals via a ref counter.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return;

    if (lockCount === 0) {
      savedHtmlOverflow = document.documentElement.style.overflow;
      savedBodyOverflow = document.body.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.documentElement.style.overflow = savedHtmlOverflow;
        document.body.style.overflow = savedBodyOverflow;
      }
    };
  }, [locked]);
}

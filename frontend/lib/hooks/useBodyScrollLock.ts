"use client";

import { useEffect, type RefObject } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedHtmlOverflow = "";
let savedBodyOverflow = "";

type LenisLike = { stop: () => void; start: () => void };

function getLenis(): LenisLike | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __lenis?: LenisLike }).__lenis ?? null;
}

function findScrollableInModal(modal: HTMLElement, target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  while (el && el !== modal) {
    if (el.classList.contains("modal-scroll")) return el;
    const style = window.getComputedStyle(el);
    const canScroll = el.scrollHeight > el.clientHeight + 2;
    if (canScroll && (style.overflowY === "auto" || style.overflowY === "scroll")) {
      return el;
    }
    el = el.parentElement;
  }
  return modal.querySelector<HTMLElement>(".modal-scroll");
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

/**
 * Route mouse-wheel / trackpad scroll to modal inner panels while Lenis is stopped.
 * Without this, only dragging the scrollbar works.
 */
export function useModalWheelScroll(
  open: boolean,
  modalRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const onWheel = (e: WheelEvent) => {
      const modal = modalRef.current;
      if (!modal || !modal.contains(e.target as Node)) return;

      const scrollEl = findScrollableInModal(modal, e.target);
      if (!scrollEl) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) return;

      const next = Math.max(0, Math.min(maxScroll, scrollTop + e.deltaY));
      if (next === scrollTop) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      scrollEl.scrollTop = next;
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [open, modalRef]);
}

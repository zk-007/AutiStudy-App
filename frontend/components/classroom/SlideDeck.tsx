"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";
import rough from "roughjs";
import type { Slide } from "@/lib/classroom/slideTypes";
import { layoutSlide, BOARD_SIZE } from "@/lib/classroom/slideLayout";

interface SlideDeckProps {
  slide: Slide;
  playing?: boolean;
  onComplete?: () => void;
}

/**
 * Step 1: Inka-style slide player.
 * Layout engine positions shapes; GSAP draws stroke-by-stroke.
 */
export function SlideDeck({ slide, playing = true, onComplete }: SlideDeckProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);

  const runAnimation = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const drawGroup = svg.querySelector("#slide-draw");
    const labelGroup = svg.querySelector("#slide-labels");
    if (!drawGroup || !labelGroup) return;

    drawGroup.innerHTML = "";
    labelGroup.innerHTML = "";

    const contentOps = slide.ops.filter((o) => o.op === "bars" || o.op === "flow");
    const laid = layoutSlide(slide.title, contentOps.length ? contentOps : []);

    // Title (always from slide.title)
    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titleEl.setAttribute("x", String(laid.title.x));
    titleEl.setAttribute("y", String(laid.title.y));
    titleEl.setAttribute("fill", "rgba(255,255,255,0.95)");
    titleEl.setAttribute("font-family", "Caveat, cursive");
    titleEl.setAttribute("font-size", String(laid.title.size));
    titleEl.setAttribute("font-weight", "700");
    titleEl.textContent = slide.title;
    titleEl.style.opacity = "0";
    labelGroup.appendChild(titleEl);

    const rc = rough.svg(drawGroup as SVGGElement);
    const pathEls: SVGPathElement[] = [];
    const strokeDelays: number[] = [];

    laid.strokes.forEach((s, i) => {
      const node = rc.path(s.d, {
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        fill: s.fill,
        roughness: 1.35,
        bowing: 1.1,
      });
      drawGroup.appendChild(node);
      const pathEl = node.querySelector("path");
      if (pathEl instanceof SVGPathElement) {
        pathEls.push(pathEl);
        strokeDelays.push(s.delay);
      }
    });

    const labelEls: SVGTextElement[] = [];
    const labelDelays: number[] = [];
    laid.labels.forEach((l) => {
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(l.x));
      text.setAttribute("y", String(l.y));
      text.setAttribute("fill", "rgba(255,255,255,0.88)");
      text.setAttribute("font-family", "Caveat, cursive");
      text.setAttribute("font-size", String(l.size));
      text.textContent = l.text;
      text.style.opacity = "0";
      labelGroup.appendChild(text);
      labelEls.push(text);
      labelDelays.push(l.delay);
    });

    const tl = gsap.timeline({
      onComplete: () => onComplete?.(),
    });

    tl.to(titleEl, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0);

    pathEls.forEach((path, i) => {
      const len = path.getTotalLength?.() || 400;
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 0.95 });
      tl.to(
        path,
        { strokeDashoffset: 0, duration: 0.85, ease: "power2.out" },
        strokeDelays[i] ?? i * 0.4,
      );
    });

    labelEls.forEach((el, i) => {
      tl.to(el, { opacity: 1, duration: 0.35 }, labelDelays[i] ?? 0.5 + i * 0.2);
    });

    return () => tl.kill();
  }, [slide, onComplete]);

  useEffect(() => {
    if (!playing) return;
    setReady(true);
    const cleanup = runAnimation();
    return cleanup;
  }, [playing, runAnimation, slide.id]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-emerald-900/40 bg-gradient-to-b from-[#1a3d2e] to-[#0f2619] shadow-2xl">
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 4px)",
        }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${BOARD_SIZE.w} ${BOARD_SIZE.h}`}
        className="w-full h-auto block"
        style={{ minHeight: 280 }}
      >
        <g id="slide-draw" />
        <g id="slide-labels" />
      </svg>
      {!ready && playing && (
        <div className="absolute inset-0 flex items-center justify-center text-emerald-200/60 text-sm">
          Loading slide…
        </div>
      )}
    </div>
  );
}

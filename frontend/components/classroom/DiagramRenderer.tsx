"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import rough from "roughjs";
import { buildDiagramPaths } from "@/lib/classroom/diagramRegistry";

interface DiagramRendererProps {
  diagram: string;
  props: Record<string, unknown>;
  onDone?: () => void;
}

/** Animate topic-specific diagrams with GSAP stroke reveal + Rough.js sketch paths. */
export function DiagramRenderer({ diagram, props, onDone }: DiagramRendererProps) {
  const groupRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;

    g.innerHTML = "";
    const paths = buildDiagramPaths(diagram, props);
    if (paths.length === 0) {
      onDone?.();
      return;
    }

    const rc = rough.svg(g);
    const pathEls: SVGPathElement[] = [];
    const labelEls: SVGTextElement[] = [];

    paths.forEach((p, i) => {
      const node = rc.path(p.d, {
        stroke: p.stroke || "rgba(255,255,255,0.9)",
        strokeWidth: p.strokeWidth || 2,
        fill: p.fill || "none",
        roughness: 1.4,
        bowing: 1.2,
      });
      node.setAttribute("data-idx", String(i));
      g.appendChild(node);
      const pathEl = node.querySelector("path") || (node as unknown as SVGPathElement);
      if (pathEl instanceof SVGPathElement) pathEls.push(pathEl);

      if (p.label && p.labelX != null && p.labelY != null) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(p.labelX));
        text.setAttribute("y", String(p.labelY));
        text.setAttribute("fill", "rgba(255,255,255,0.85)");
        text.setAttribute("font-family", "Caveat, cursive");
        text.setAttribute("font-size", "18");
        text.textContent = p.label;
        text.style.opacity = "0";
        g.appendChild(text);
        labelEls.push(text);
      }
    });

    const tl = gsap.timeline({ onComplete: () => onDone?.() });
    pathEls.forEach((path, i) => {
      const len = path.getTotalLength?.() || 300;
      gsap.set(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 0.9 });
      tl.to(
        path,
        { strokeDashoffset: 0, duration: 0.9, ease: "power2.out" },
        i * 0.35,
      );
      if (labelEls[i]) {
        tl.to(labelEls[i], { opacity: 1, duration: 0.3 }, i * 0.35 + 0.5);
      }
    });

    return () => {
      tl.kill();
    };
  }, [diagram, props, onDone]);

  return <g ref={groupRef} />;
}

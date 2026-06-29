"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Same normalization as chat — render LaTeX instead of raw `$...$`. */
export function normalizeQuizMath(input: string): string {
  if (!input) return input;
  let s = input;
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `\n$$${body.trim()}$$\n`);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$${body.trim()}$`);
  return s;
}

export function QuizMarkdown({
  text,
  size = "base",
  className = "",
}: {
  text: string;
  size?: "sm" | "base" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "lg"
      ? "text-xl font-bold leading-snug"
      : size === "sm"
        ? "text-sm font-medium leading-relaxed"
        : "text-[15px] leading-relaxed";

  return (
    <div className={`quiz-markdown markdown-body ${sizeClass} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span className="inline">{children}</span>,
          strong: ({ children }) => (
            <strong className="font-semibold text-deep">{children}</strong>
          ),
        }}
      >
        {normalizeQuizMath(text)}
      </ReactMarkdown>
    </div>
  );
}

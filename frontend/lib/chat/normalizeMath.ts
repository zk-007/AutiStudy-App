/**
 * Prepare tutor markdown for remark-math + KaTeX.
 * GPT often emits broken or undelimited LaTeX — fix before render.
 */
export function normalizeMath(input: string): string {
  if (!input) return input;
  let s = input;

  // Common GPT typos / malformed \text{...}
  s = s.replace(/\\textside\}/gi, "\\text{side length}");
  s = s.replace(/\\textside\b/gi, "\\text{side length}");
  s = s.replace(/\\mathbf\{\\backslash\s*/g, "");
  s = s.replace(/\\backslash\s+/g, "");
  s = s.replace(/\\text\{([^}]*)\}length/gi, "\\text{$1 length}");

  // Standard delimiters: \( \) and \[ \]
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `\n$$${cleanMathBody(body)}$$\n`);
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$${cleanMathBody(body)}$`);

  // Auto-wrap bare LaTeX command runs (no surrounding $ yet)
  s = wrapBareLatexSegments(s);

  return s;
}

function cleanMathBody(body: string): string {
  return body.trim().replace(/\\textside\}/gi, "\\text{side length}");
}

/** Wrap segments containing LaTeX commands in $...$ if not already delimited. */
function wrapBareLatexSegments(text: string): string {
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return parts
    .map((part) => {
      if (!part || part.startsWith("$")) return part;
      return part.replace(
        /([^\n]*\\(?:frac|times|div|sqrt|text\{[^{}]*\}|pm|leq|geq|neq|approx)[^\n]*)/g,
        (chunk) => {
          const t = chunk.trim();
          if (!t || t.startsWith("$")) return chunk;
          // Whole-line equations: Perimeter = 4 \times ...
          if (/\\(?:frac|times|div|sqrt|text\{)/.test(t)) {
            return `$${t.replace(/\s+/g, " ").trim()}$`;
          }
          return chunk;
        },
      );
    })
    .join("");
}

/** Practical email format — local@domain.tld */
const EMAIL_RE =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Real consumer domains — for fuzzy typo detection, not a typo list. */
const KNOWN_FREE_PROVIDERS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
] as const;

const TYPO_TLDS = new Set(["co", "con", "cm", "om", "comm", "coml", "cpm"]);
const TYPO_SIMILARITY = 0.82;

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (!longer.length) return 1;
  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function suggestProviderTypo(domain: string): string | null {
  if ((KNOWN_FREE_PROVIDERS as readonly string[]).includes(domain)) return null;

  const labels = domain.split(".");
  if (labels.length < 2) return null;

  const stem = labels[0];
  const tld = labels[labels.length - 1];

  if (TYPO_TLDS.has(tld)) {
    for (const known of KNOWN_FREE_PROVIDERS) {
      const knownStem = known.split(".")[0];
      if (similarity(stem, knownStem) >= TYPO_SIMILARITY) return known;
    }
  }

  let bestMatch: string | null = null;
  let bestRatio = 0;
  for (const known of KNOWN_FREE_PROVIDERS) {
    const knownTld = known.slice(known.lastIndexOf(".") + 1);
    if (tld !== knownTld) continue;
    const ratio = similarity(domain, known);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestMatch = known;
    }
  }

  if (bestMatch && bestRatio >= TYPO_SIMILARITY && domain !== bestMatch) {
    return bestMatch;
  }
  return null;
}

/** Returns an error message if invalid, otherwise null. */
export function validateEmail(email: string): string | null {
  const raw = (email ?? "").trim();
  if (!raw) return "Please enter an email address.";
  if (raw.length > 254) return "Email address is too long.";
  if (/\s/.test(raw) || raw.includes("..")) return "Please enter a valid email address.";
  if ((raw.match(/@/g) ?? []).length !== 1) {
    return "Please enter a valid email address (e.g. name@gmail.com).";
  }

  const at = raw.lastIndexOf("@");
  const local = raw.slice(0, at).trim();
  const domain = raw.slice(at + 1).trim().toLowerCase();

  if (!EMAIL_RE.test(`${local}@${domain}`)) {
    return "Please enter a valid email address (e.g. name@gmail.com).";
  }

  for (const label of domain.split(".")) {
    if (!label || label.length > 63 || !DOMAIN_LABEL_RE.test(label)) {
      return "Please enter a valid email domain.";
    }
  }

  const suggested = suggestProviderTypo(domain);
  if (suggested) {
    return `That email domain looks misspelled. Did you mean ${local}@${suggested}?`;
  }

  return null;
}

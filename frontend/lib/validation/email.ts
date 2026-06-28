const DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmsil.com": "gmail.com",
  "gmil.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
};

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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

  if (!local || !domain) return "Please enter a valid email address.";
  if (local.length > 64) return "The part before @ is too long.";
  if (local.startsWith(".") || local.endsWith(".")) return "Please enter a valid email address.";
  if (!domain.includes(".")) {
    return "Email must use a proper domain (e.g. gmail.com or school.edu.pk).";
  }

  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld)) {
    return "Please use a valid domain extension (e.g. .com, .org, .edu, .pk).";
  }

  for (const label of labels) {
    if (!label || label.length > 63 || !DOMAIN_LABEL_RE.test(label)) {
      return "Please enter a valid email domain.";
    }
  }

  if (DOMAIN_TYPOS[domain]) {
    return `That email domain looks misspelled. Did you mean ${local}@${DOMAIN_TYPOS[domain]}?`;
  }

  if (domain.endsWith(".com") && !domain.includes("gmail")) {
    const stem = domain.slice(0, -4);
    if (["gmai", "gmial", "gmal", "gamil", "gnail", "gmsil", "gmil"].includes(stem)) {
      return `That email domain looks misspelled. Did you mean ${local}@gmail.com?`;
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(`${local}@${domain}`)) {
    return "Please enter a valid email address (e.g. name@gmail.com).";
  }

  return null;
}

/**
 * Helpers that keep the user's intended URL alive across the auth wall.
 *
 * Why this exists
 * ---------------
 * Before this helper, any guarded page (e.g. `/chat?session=abc123`) that
 * detected a missing token would do `router.replace("/login")`, throwing
 * away the original `?session=...` query. After login the user landed on
 * `/dashboard` instead of the chat they had open.
 *
 * The pattern here is the standard "next" / "return URL" pattern:
 *   1. Guard pages call `loginUrlFor(currentPath)` to build
 *      `/login?next=<encoded original URL>`.
 *   2. /login and /signup read `?next=` and, after a successful auth call,
 *      navigate to that URL via `safeNext()`.
 *
 * `safeNext()` only honours **same-origin, single-leading-slash** paths so
 * an attacker can't craft `?next=//evil.com/...` and use AutiStudy as an
 * open redirector.
 */

/**
 * Build the URL we should send an unauthenticated visitor to. Encodes the
 * page they were trying to reach so we can come back after they sign in.
 *
 * Safe to call from a `useEffect` body: it inspects `window.location` and
 * gracefully returns `"/login"` during SSR.
 */
export function loginUrlFor(currentPath?: string): string {
  let here = currentPath ?? "";
  if (!here && typeof window !== "undefined") {
    here = window.location.pathname + window.location.search;
  }
  // Don't loop: if we're already on an auth page or have nothing meaningful,
  // just go to /login with no `next`.
  if (!here || here === "/" || here.startsWith("/login") || here.startsWith("/signup")) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(here)}`;
}

/**
 * Validate a `?next=` value before navigating to it.
 *
 * We accept ONLY same-origin paths — must start with a single "/" and must
 * not start with "//" (which browsers treat as a protocol-relative URL and
 * would let an attacker hop off to another host). Anything else falls back
 * to the default landing page.
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

const RETURN_URL_KEY = "autistudy_return_url";

/** Remember where the student was before auth forced a login redirect. */
export function saveReturnUrl(path: string) {
  if (typeof window === "undefined") return;
  if (!path || path === "/" || path.startsWith("/login") || path.startsWith("/signup")) return;
  if (!path.startsWith("/") || path.startsWith("//")) return;
  window.localStorage.setItem(RETURN_URL_KEY, path);
}

export function getReturnUrl(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(RETURN_URL_KEY);
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

/** Resolve post-login destination: ?next= param, then saved URL, then dashboard. */
export function resolveReturnUrl(nextParam: string | null | undefined): string {
  const fromQuery = nextParam ? safeNext(nextParam, "") : "";
  if (fromQuery) return fromQuery;
  const saved = getReturnUrl();
  if (saved) return saved;
  return "/dashboard";
}

export function clearReturnUrl() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RETURN_URL_KEY);
}

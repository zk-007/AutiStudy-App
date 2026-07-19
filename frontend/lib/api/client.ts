/**
 * Thin typed fetch wrapper for the AutiStudy FastAPI backend.
 *
 * All API calls funnel through `api()` so we have ONE place to handle
 * auth headers, error parsing, base URL, and (eventually) retries.
 *
 * The base URL can be overridden with NEXT_PUBLIC_API_URL — useful when
 * you deploy the API to a remote host (e.g., a Hugging Face Space).
 */

/**
 * The base URL can be overridden with NEXT_PUBLIC_API_URL — useful when
 * you deploy the API to a remote host (e.g., a Hugging Face Space).
 *
 * On Vercel (VERCEL=1) we default to the Railway production API so every
 * git push deploy works even if the dashboard env var was never set.
 */

const LOCAL_API = "http://127.0.0.1:8000";
const PRODUCTION_API = "https://autistudy-app-production.up.railway.app";

function normalizeApiBase(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  url = url.replace(/^https:\/\/https:\/\//i, "https://");
  url = url.replace(/^http:\/\/https:\/\//i, "https://");
  return url;
}

function isLocalDevHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/** Resolve API base at call time so production never sticks to localhost. */
export function getApiBase(): string {
  const envUrl =
    typeof process !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "").trim()
      : "";

  if (typeof window !== "undefined" && !isLocalDevHost()) {
    if (
      envUrl &&
      !envUrl.includes("127.0.0.1") &&
      !envUrl.includes("localhost")
    ) {
      return normalizeApiBase(envUrl);
    }
    return PRODUCTION_API;
  }

  if (envUrl) return normalizeApiBase(envUrl);

  if (typeof process !== "undefined" && process.env.VERCEL === "1") {
    return PRODUCTION_API;
  }

  return LOCAL_API;
}

export const API_BASE = getApiBase();

const TOKEN_KEY = "autistudy_token";
const PARENT_TOKEN_KEY = "autistudy_parent_token";
const SESSION_KEY = "autistudy_session";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** Persist token + user so reload keeps the student signed in. */
export function saveSession(token: string, user: User) {
  if (typeof window === "undefined") return;
  setToken(token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}

export function loadStoredSession(): { token: string; user: User } | null {
  if (typeof window === "undefined") return null;
  const token = getToken();
  if (!token) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { token: string; user: User };
    if (data.token !== token || !data.user?.email) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  setToken(null);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export function getParentToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PARENT_TOKEN_KEY);
}

export function setParentToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(PARENT_TOKEN_KEY, token);
  else window.localStorage.removeItem(PARENT_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail: string;
  /** Seconds until a rate-limited action can be retried (from Retry-After). */
  retryAfterSec?: number;
  constructor(status: number, detail: string, retryAfterSec?: number) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.retryAfterSec = retryAfterSec;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
  /** Extra retries after a network failure (default 1 = two attempts total). */
  retries?: number;
  /** Delay between retries in ms. */
  retryDelayMs?: number;
}

export async function api<T = unknown>(
  path: string,
  {
    method = "GET",
    body,
    auth = true,
    signal,
    retries = 1,
    retryDelayMs = 1500,
  }: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${getApiBase()}${path}`;
  const attempt = async (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

  let res: Response | undefined;
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      res = await attempt();
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
    }
  }

  if (lastErr !== undefined || !res) {
    throw new ApiError(
      0,
      `Cannot reach the AutiStudy server at ${getApiBase()}. The backend may be waking up — wait a few seconds and try again.`,
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail)) {
        // pydantic validation errors
        detail = data.detail.map((d: { msg?: string }) => d.msg || "").join("; ");
      }
    } catch {
      /* ignore — keep the default detail */
    }
    const retryRaw = res.headers.get("Retry-After");
    let retryAfterSec: number | undefined;
    if (retryRaw) {
      const n = Number.parseInt(retryRaw, 10);
      if (Number.isFinite(n) && n > 0) retryAfterSec = n;
    }
    if (retryAfterSec == null) {
      const m = detail.match(/wait\s+(\d+)\s*s/i);
      if (m) retryAfterSec = Number.parseInt(m[1], 10);
    }
    throw new ApiError(res.status, detail, retryAfterSec);
  }

  // 204 / empty body
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/** Image / TTS can take 30–90s — longer timeout + extra retries. */
async function apiMedia<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    return await api<T>(path, {
      ...opts,
      signal: controller.signal,
      retries: 3,
      retryDelayMs: 2000,
    });
  } finally {
    clearTimeout(timeout);
  }
}


// ─── Typed endpoint helpers ──────────────────────────────────────────────────

export interface User {
  name: string;
  email: string;
  role: string;
  grade: number;
  stars: number;
  badges: string[];
  progress: Record<string, unknown>;
  family_code?: string;
  /** Illustrated avatar id (Part B #2) — null/undefined shows initials instead. */
  avatar?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
  family_code?: string;
}

export interface Stats {
  stars: number;
  streak_days: number;
  total_quizzes: number;
  total_questions: number;
  total_correct: number;
  overall_accuracy: number;
  total_time_minutes: number;
  daily_activity: { date: string; questions: number; correct: number; accuracy: number; time: number }[];
  subject_breakdown: Record<
    string,
    { attempts: number; questions: number; correct: number; accuracy: number; avg_time: number }
  >;
}

export interface Subject {
  name: string;
  icon: string;
  grade: number;
  last_studied: string | null;
}

export interface RecentChat {
  id: string;
  subject: string | null;
  title: string | null;
  timestamp: string | null;
  language: string;
  message_count: number;
  last_message_snippet: string | null;
}

export interface RecentQuiz {
  id: string;
  subject: string;
  grade: number | null;
  score_percent: number;
  num_correct: number;
  num_questions: number;
  timestamp: string;
}

export const authApi = {
  register: (body: { name: string; email: string; password: string; grade: number; role?: string }) =>
    api<AuthResponse>("/api/auth/register", { method: "POST", body, auth: false }),
  login: (body: { email: string; password: string }) =>
    api<AuthResponse>("/api/auth/login", { method: "POST", body, auth: false }),
  logout: () => api<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => api<User>("/api/auth/me"),
  deleteAccount: (body: { password: string }) =>
    api<{ ok: boolean }>("/api/users/me/delete", { method: "POST", body }),
};

/** Part B #6 — Contact form (public; saved server-side; email later). */
export interface ContactPayload {
  name: string;
  email: string;
  role: "student" | "parent" | "teacher" | "other";
  subject: string;
  message: string;
}

export const contactApi = {
  submit: (body: ContactPayload) =>
    api<{ ok: boolean; id: string; detail: string }>("/api/contact", {
      method: "POST",
      body,
      auth: false,
    }),
};

/** Part B #9 — Dashboard enhancements. */
export type MoodId = "great" | "good" | "okay" | "tired" | "frustrated";

export interface ScheduleItem {
  id: string;
  title: string;
  subject: string | null;
  done: boolean;
}

export interface LearnerJourney {
  streak_days: number;
  health: number;
  stage: "seed" | "sprout" | "growing" | "flourishing" | "mighty";
  wilted: boolean;
  active_today: boolean;
  total_active_days: number;
  recent_days: string[];
}

export interface DashboardExtras {
  time: {
    today_minutes: number;
    week_minutes: number;
    total_minutes: number;
  };
  lessons: {
    covered: number;
    today: number;
  };
  mood_today: MoodId | null;
  schedule: ScheduleItem[];
  journey: LearnerJourney;
  valid_moods: MoodId[];
}

export const userApi = {
  stats: () => api<Stats>("/api/users/me/stats"),
  subjects: () => api<Subject[]>("/api/users/me/subjects"),
  recentChats: () => api<RecentChat[]>("/api/users/me/recent-chats"),
  recentQuizzes: () => api<RecentQuiz[]>("/api/users/me/recent-quizzes"),
  /** Part B #9 — time, lessons, mood, schedule, Learner Journey. */
  dashboard: () => api<DashboardExtras>("/api/users/me/dashboard"),
  saveMood: (mood: MoodId) =>
    api<{ date: string; mood: MoodId; dashboard: DashboardExtras }>("/api/users/me/mood", {
      method: "POST",
      body: { mood },
    }),
  getSchedule: () =>
    api<{ date: string; items: ScheduleItem[] }>("/api/users/me/schedule"),
  saveSchedule: (items: ScheduleItem[]) =>
    api<{ date: string; items: ScheduleItem[] }>("/api/users/me/schedule", {
      method: "PUT",
      body: { items },
    }),
  toggleScheduleItem: (itemId: string) =>
    api<{ date: string; items: ScheduleItem[] }>(
      `/api/users/me/schedule/${encodeURIComponent(itemId)}/toggle`,
      { method: "POST" },
    ),
  /** Part B #8 — Account Controls: change registered email (password-confirmed). */
  requestEmailChange: (new_email: string, password: string) =>
    api<{
      ok: boolean;
      email: string;
      detail: string;
      expires_in_sec?: number;
      retry_after_sec?: number;
      dev_mode?: boolean;
      dev_otp?: string;
    }>("/api/users/me/email/request", {
      method: "POST",
      body: { new_email, password },
    }),
  verifyEmailChange: (new_email: string, code: string) =>
    api<{ ok: boolean; user: User; detail: string }>("/api/users/me/email/verify", {
      method: "POST",
      body: { new_email, code },
    }),
  /** @deprecated use requestEmailChange — now starts OTP to the new inbox */
  changeEmail: (new_email: string, password: string) =>
    api<{
      ok: boolean;
      email: string;
      detail: string;
      expires_in_sec?: number;
      retry_after_sec?: number;
      dev_mode?: boolean;
      dev_otp?: string;
    }>("/api/users/me/email/request", {
      method: "POST",
      body: { new_email, password },
    }),
  /** Part B #8 — Account Controls: change grade/class. */
  changeGrade: (grade: number) =>
    api<User>("/api/users/me/grade", { method: "PATCH", body: { grade } }),
};

// ─── Learner profile (one-time onboarding — Gap #2: Persistent Learner Profile) ─

export interface LearnerProfile {
  onboarding_completed: boolean;
  learning_style: "visual" | "audio" | "text" | "mixed" | null;
  preferred_language: "en" | "ur" | null;
  audio_preference: "auto" | "manual" | null;
  sensory_preference: "calm" | "standard" | null;
  explanation_style: "step_by_step" | "concise" | null;
  updated_at: string | null;
}

export const profileApi = {
  get: () => api<LearnerProfile>("/api/profile/learning"),
  save: (body: {
    learning_style: string;
    preferred_language: string;
    audio_preference: string;
    sensory_preference: string;
    explanation_style: string;
  }) => api<LearnerProfile>("/api/profile/learning", { method: "POST", body }),
  updateAudioPreference: (audio_preference: "auto" | "manual") =>
    api<LearnerProfile>("/api/profile/learning/audio", {
      method: "PATCH",
      body: { audio_preference },
    }),
};

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * One step inside a `MathStepCard`. `caption` is plain text shown above the
 * math; `latex` is the equation written WITHOUT surrounding `$` delimiters
 * (the renderer adds them).
 */
export interface MathStep {
  caption: string;
  latex: string;
}

/**
 * Backend payload for a "step-by-step solution" attached to an assistant
 * message — used instead of a generated image when the question is symbolic
 * math (fractions, decimals, algebra) where DALL·E would miscount/garble.
 */
export interface MathStepCard {
  title: string;
  steps: MathStep[];
  final_answer: string;
}

/**
 * Backend payload for the in-browser emoji counting illustration.
 * Returned for simple whole-number +/-/× questions (both operands ≤ 10).
 * The React EmojiCountingView component animates two groups of emoji and
 * combines them — no DALL·E call, no API cost, 100% accurate count.
 */
export interface EmojiCountingData {
  n1: number;
  n2: number;
  op: "+" | "-" | "×";
  result: number;
  emoji: string;   // emoji for group A (and result)
  emoji2: string;  // emoji for group B (addition) or same as emoji
  label: string;
  label2: string;
  title: string;   // e.g. "3 + 5 = 8"
}

// ── New illustration data types (grades 4-6 curriculum) ─────────────────────

/** One step of a prime-factorization division ladder: 2 | 12 → quotient 6 */
export interface DivisionStep { divisor: number; quotient: number; }

/**
 * Data for the FactorTreeView component.
 * Covers HCF, LCM, and standalone prime factorization.
 */
export interface FactorTreeData {
  title: string;
  task: "hcf" | "lcm" | "factorize";
  numbers: number[];
  ladders: DivisionStep[][];      // one ladder per number
  prime_factors: number[][];      // one list per number
  hcf: number | null;
  lcm: number | null;
  common_factors: number[];
}

/**
 * Data for the FractionBarView component.
 * Shows shaded bar(s) for up to 4 fractions, with optional operation result.
 */
export interface FractionBarData {
  title: string;
  fractions: { num: number; den: number }[];
  op: "+" | "-" | "*" | "/" | null;
  result: { num: number; den: number } | null;
}

/**
 * Data for the NumberLineView component.
 * Shows integers on a number line with optional addition/subtraction arrow.
 */
export interface NumberLineData {
  title: string;
  points: number[];
  min_val: number;
  max_val: number;
  op: "+" | "-" | null;
  result: number | null;
  arrows: { from: number; to: number; label: string }[];
}

/**
 * Data for the BarChartView component.
 * Extracted by the LLM from the student's data-handling question.
 */
export interface BarChartData {
  title: string;
  labels: string[];
  values: number[];
  x_label: string;
  y_label: string;
  chart_type: "bar" | "pie";
}

/** Percentage bar: shows N% shaded on a 100-unit bar. */
export interface PercentageBarData {
  title: string;
  percentage: number;
  total: number;
  label: string;
}

/** Times table: 12 rows of multiplier × factor = product. */
export interface TimesTableData {
  title: string;
  multiplier: number;
  rows: { factor: number; product: number }[];
}

/** Geometry shape with optional dimensions, area, perimeter, angles. */
export interface GeometryData {
  title: string;
  shape: "triangle" | "rectangle" | "square" | "circle" | "angle" | "parallelogram" | string;
  dimensions: Record<string, number>;
  area: number | null;
  perimeter: number | null;
  angles: number[] | null;
  /** perimeter | area | both | shape — controls which parts of the diagram to show */
  focus?: "perimeter" | "area" | "both" | "shape" | string;
  unit?: string;
}

/** Ratio / balance scale: two quantities with simplified ratio. */
export interface RatioData {
  title: string;
  left_label: string;
  left_value: number;
  right_label: string;
  right_value: number;
  ratio_text: string;
  simplified: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  image_url: string | null;
  skip_tutor?: boolean;
  math_steps?: MathStepCard | null;
  emoji_counting?: EmojiCountingData | null;
  factor_tree?: FactorTreeData | null;
  fraction_bar?: FractionBarData | null;
  number_line?: NumberLineData | null;
  bar_chart?: BarChartData | null;
  percentage_bar?: PercentageBarData | null;
  times_table?: TimesTableData | null;
  geometry?: GeometryData | null;
  ratio?: RatioData | null;
}

export interface ChatSession {
  id: string;
  subject: string | null;
  grade: number | null;
  language: string;
  title: string | null;
  timestamp: string | null;
  messages: ChatMessage[];
}

export interface ChatSessionSummary {
  id: string;
  subject: string | null;
  title: string | null;
  timestamp: string | null;
  language: string;
  message_count: number;
}

export interface SessionRecapResponse {
  empty: boolean;
  message: string;
  topic_summary: string;
  key_points: string[];
  subject: string;
  grade: number;
}

export interface SendMessageResponse {
  user_message: ChatMessage | null;
  assistant_message: ChatMessage;
  is_relevant?: boolean;
  session: {
    id: string;
    title: string | null;
    message_count: number;
    timestamp?: string | null;
  };
}

export interface ChatConfig {
  tutor_configured: boolean;
  // Optional fields — populated when the RAG-backed engine is in use.
  // Older API builds may not return these, so consumers should treat
  // them as undefined-friendly.
  rag_available?: boolean;
  total_vectors?: number;
  images_available?: boolean;
  speech_available?: boolean;
}

/**
 * Response from `POST /api/chat/sessions/:id/image`.
 *
 * The endpoint name is historical — the backend now routes the request to
 * EITHER a DALL·E image OR a KaTeX step card depending on the question
 * (see `chat_engine.generate_visual_aid`). The `kind` discriminator tells
 * the client which payload field to read.
 */
export type GenerateVisualAidResponse =
  | { kind: "image";           image_url: string;               message_index: number }
  | { kind: "math_steps";      math_steps: MathStepCard;        message_index: number }
  | { kind: "emoji_counting";  emoji_counting: EmojiCountingData; message_index: number }
  | { kind: "factor_tree";     factor_tree: FactorTreeData;     message_index: number }
  | { kind: "fraction_bar";    fraction_bar: FractionBarData;   message_index: number }
  | { kind: "number_line";     number_line: NumberLineData;     message_index: number }
  | { kind: "bar_chart";       bar_chart: BarChartData;         message_index: number }
  | { kind: "percentage_bar";  percentage_bar: PercentageBarData; message_index: number }
  | { kind: "times_table";     times_table: TimesTableData;     message_index: number }
  | { kind: "geometry";        geometry: GeometryData;          message_index: number }
  | { kind: "ratio";           ratio: RatioData;                message_index: number };

// Older alias kept so existing imports keep compiling.
export type GenerateImageResponse = GenerateVisualAidResponse;

export interface SpeechResponse {
  audio_base64: string;
  mime_type: string;
}

/**
 * Resolve a chat-image URL returned by the backend into something the
 * <img> tag can load directly. The API returns either a fully-qualified
 * remote URL (DALL·E) or a path under `/api/generated-images/...`
 * (locally cached gpt-image output) — only the latter needs prefixing.
 */
export function resolveImageUrl(raw: string): string {
  if (!raw) return raw;
  // Pass through anything the browser can render directly: full URLs and data URIs.
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return `${getApiBase()}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

// ── Quiz + Analytics types ────────────────────────────────────────────────────

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
}

export interface QuizGenerateResponse {
  questions: QuizQuestion[];
  grade: number;
  subject: string;
  topic?: string;
  from_chat?: boolean;
}

export interface QuizSubmitResponse {
  score_percent: number;
  num_correct: number;
  num_questions: number;
  stars_earned: number;
  attempt_id: string;
}

export interface QuizAttempt {
  id: string;
  timestamp: string;
  grade: number;
  subject: string;
  num_questions: number;
  num_correct: number;
  score_percent: number;
  total_time_seconds: number;
}

export interface SubjectBreakdown {
  attempts: number;
  questions: number;
  correct: number;
  accuracy: number;
  avg_time: number;
}

export interface DailyActivity {
  date: string;
  questions: number;
  correct: number;
  accuracy: number;
  time: number;
}

export interface AnalyticsData {
  total_attempts: number;
  total_questions: number;
  total_correct: number;
  overall_accuracy: number;
  total_time_minutes: number;
  avg_time_per_question: number;
  streak_days: number;
  total_stars: number;
  recent_attempts: QuizAttempt[];
  subject_breakdown: Record<string, SubjectBreakdown>;
  daily_activity: DailyActivity[];
  performance_trend: { date: string; accuracy: number; subject: string }[];
}

export interface BookChapter {
  number: number;
  title: string;
}

export const quizApi = {
  chapters: (subject: string) =>
    api<{ chapters: BookChapter[]; grade: number; subject: string }>(`/api/quiz/chapters?subject=${encodeURIComponent(subject)}`),
  generateFromChat: (subject: string, num_questions = 5) =>
    api<QuizGenerateResponse>("/api/quiz/generate-from-chat", {
      method: "POST",
      body: { subject, num_questions },
    }),
  generate: (subject: string, num_questions = 5, topic?: string, chapter_number?: number) =>
    api<QuizGenerateResponse>("/api/quiz/generate", {
      method: "POST",
      body: { subject, num_questions, topic, chapter_number },
    }),
  submit: (payload: {
    subject: string;
    questions: QuizQuestion[];
    answers: string[];
    time_per_question: number[];
    total_time: number;
  }) =>
    api<QuizSubmitResponse>("/api/quiz/submit", {
      method: "POST",
      body: payload,
    }),
  history: () => api<{ history: QuizAttempt[] }>("/api/quiz/history"),
  analytics: () => api<AnalyticsData>("/api/analytics"),
};

export type VisualAidAttachTo = "substantive" | "last";

export interface GenerateVisualAidOptions {
  attachTo?: VisualAidAttachTo;
  stubMessage?: string;
}

export const chatApi = {
  config: () => api<ChatConfig>("/api/chat/config"),
  list: () => api<ChatSessionSummary[]>("/api/chat/sessions"),
  create: (subject: string, language: "en" | "ur" = "en") =>
    api<ChatSession>("/api/chat/sessions", {
      method: "POST",
      body: { subject, language },
    }),
  get: (id: string) => api<ChatSession>(`/api/chat/sessions/${id}`),
  remove: (id: string) =>
    api<{ ok: boolean }>(`/api/chat/sessions/${id}`, { method: "DELETE" }),
  send: (id: string, content: string, preferredFormat?: string) =>
    api<SendMessageResponse>(`/api/chat/sessions/${id}/messages`, {
      method: "POST",
      body: { content, preferred_format: preferredFormat ?? "normal" },
    }),
  /**
   * Ask the tutor to attach a visual aid to the latest assistant message.
   * Returns either an `image` (DALL·E illustration) or `math_steps`
   * (KaTeX step card) depending on what the question calls for.
   */
  generateVisualAid: (id: string, options?: GenerateVisualAidOptions) =>
    apiMedia<GenerateVisualAidResponse>(`/api/chat/sessions/${id}/image`, {
      method: "POST",
      body: {
        attach_to: options?.attachTo ?? "substantive",
        stub_message: options?.stubMessage ?? null,
      },
    }),
  generateChatQuiz: (id: string) =>
    api<{ questions: QuizQuestion[]; topic_summary: string; grade: number; subject: string }>(
      `/api/chat/sessions/${id}/quiz`,
      { method: "POST", body: {} },
    ),
  getRecap: (id: string) =>
    api<SessionRecapResponse>(`/api/chat/sessions/${id}/recap`),
  // Back-compat alias — older call sites may still use `generateImage`.
  generateImage: (id: string, options?: GenerateVisualAidOptions) =>
    apiMedia<GenerateVisualAidResponse>(`/api/chat/sessions/${id}/image`, {
      method: "POST",
      body: {
        attach_to: options?.attachTo ?? "substantive",
        stub_message: options?.stubMessage ?? null,
      },
    }),
  speak: (text: string, language: "en" | "ur" = "en", voice?: string) =>
    apiMedia<SpeechResponse>("/api/chat/speech", {
      method: "POST",
      body: { text, language, voice: voice ?? null },
    }),
};

// ── Parent auth ───────────────────────────────────────────────────────────────

export type ParentRelationship = "father" | "mother";

export interface LinkedChildRef {
  email: string;
  linked_at?: string | null;
  invite_id?: string | null;
  relationship?: ParentRelationship;
}

export interface ParentChildSummary {
  email: string;
  name: string;
  grade?: number | null;
  stars?: number;
  avatar?: string | null;
  relationship: ParentRelationship;
  linked_at?: string | null;
  exists: boolean;
}

export interface ParentUser {
  email: string;
  name: string;
  cnic?: string | null;
  relationship?: ParentRelationship;
  children?: LinkedChildRef[];
  child_email: string | null;
  verified: boolean;
  email_verified?: boolean;
  link_status?: "none" | "pending" | "linked";
  pending_child_email?: string | null;
  pending_invite_id?: string | null;
  role: "parent";
}

export interface ParentAuthResponse {
  token: string;
  user: ParentUser;
}

export interface SignupPendingResponse {
  ok: boolean;
  email: string;
  detail: string;
  expires_in_sec?: number;
  retry_after_sec?: number;
  dev_mode?: boolean;
  dev_otp?: string;
}

export interface LinkedParentInfo {
  email: string;
  name?: string;
  relationship?: ParentRelationship;
  linked_at?: string;
  invite_id: string;
}

export interface FamilyLinkStatus {
  pending_requests: {
    invite_id: string;
    parent_email: string;
    parent_name: string;
    relationship?: ParentRelationship;
    pending_at?: string;
  }[];
  linked_parents?: LinkedParentInfo[];
  linked_parent: LinkedParentInfo | null;
  slots?: {
    father: LinkedParentInfo | null;
    mother: LinkedParentInfo | null;
    open_slots: ParentRelationship[];
    can_invite_more: boolean;
  };
  can_invite_more?: boolean;
  active_invites: {
    id: string;
    created_at?: string;
    expires_at?: string;
    expired: boolean;
    used: boolean;
    cancelled: boolean;
    status: string;
  }[];
}

/** Fetch wrapper that sends the parent token instead of the child token. */
async function apiParent<T = unknown>(
  path: string,
  { method = "GET", body }: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getParentToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the AutiStudy server.");
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch { /* ignore */ }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface ParentDashboardData {
  child: { name: string; grade: number; stars: number; email: string; avatar?: string | null };
  relationship?: ParentRelationship;
  children_count?: number;
  analytics: {
    total_attempts: number;
    total_questions: number;
    total_correct: number;
    overall_accuracy: number;
    total_time_minutes: number;
    avg_time_per_question: number;
    streak_days: number;
    subject_breakdown: { subject: string; accuracy: number; attempts: number }[] | Record<string, { accuracy: number; attempts: number; questions: number; correct: number }>;
    daily_activity: { date: string; questions: number; correct: number; accuracy: number; time: number }[];
  };
  favourite_subject: string;
  total_chats: number;
  quiz_history: { subject: string; score_percent: number; num_correct: number; num_questions: number; timestamp: string; avg_time_per_question?: number }[];
  total_correct: number;
  total_wrong: number;
  score_trend: { date: string; score: number; subject: string }[];
  speed_analysis: { subject: string; avg_sec_per_q: number }[];
  consistency: number;
  improvement: number | null;
}

const SELECTED_CHILD_KEY = "autistudy_selected_child_email";

export function getSelectedChildEmail(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SELECTED_CHILD_KEY);
}

export function setSelectedChildEmail(email: string | null) {
  if (typeof window === "undefined") return;
  if (email) sessionStorage.setItem(SELECTED_CHILD_KEY, email);
  else sessionStorage.removeItem(SELECTED_CHILD_KEY);
}

export const parentApi = {
  /** V6 — parent signup starts OTP; no token until verify-email. */
  signup: (body: {
    name: string;
    email: string;
    password: string;
    relationship: ParentRelationship;
  }) =>
    api<SignupPendingResponse>("/api/auth/parent/signup", {
      method: "POST",
      body,
      auth: false,
    }),

  login: (body: { email: string; password: string }) =>
    fetch(`${getApiBase()}/api/auth/parent/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data?.detail ?? "Login failed");
      }
      return res.json() as Promise<ParentAuthResponse>;
    }),

  logout: () => apiParent<{ ok: boolean }>("/api/auth/parent/logout", { method: "POST" }),
  me: () => apiParent<ParentUser>("/api/auth/parent/me"),
  changePassword: (current_password: string, new_password: string) =>
    apiParent<{ ok: boolean; detail: string }>("/api/auth/parent/password", {
      method: "POST",
      body: { current_password, new_password },
    }),
  deleteAccount: (password: string) =>
    apiParent<{ ok: boolean; detail: string }>("/api/auth/parent/delete", {
      method: "POST",
      body: { password },
    }),
  requestEmailChange: (new_email: string, password: string) =>
    apiParent<{
      ok: boolean;
      email: string;
      detail: string;
      expires_in_sec?: number;
      retry_after_sec?: number;
      dev_mode?: boolean;
      dev_otp?: string;
      will_unlink?: boolean;
    }>("/api/auth/parent/email/request", {
      method: "POST",
      body: { new_email, password },
    }),
  verifyEmailChange: (new_email: string, code: string) =>
    apiParent<{
      ok: boolean;
      user: ParentUser;
      detail: string;
      needs_relink?: boolean;
    }>("/api/auth/parent/email/verify", {
      method: "POST",
      body: { new_email, code },
    }),
  children: () =>
    apiParent<{
      relationship?: ParentRelationship;
      pending_child_email?: string | null;
      pending_invite_id?: string | null;
      link_status?: string;
      children: ParentChildSummary[];
      count: number;
    }>("/api/parent/children"),
  dashboard: (childEmail?: string | null) => {
    const q = childEmail ? `?child_email=${encodeURIComponent(childEmail)}` : "";
    return apiParent<ParentDashboardData>(`/api/parent/dashboard${q}`);
  },
  report: (childEmail?: string | null) => {
    const q = childEmail ? `?child_email=${encodeURIComponent(childEmail)}` : "";
    return apiParent<{ child_name: string; report: string; generated_at: string }>(
      `/api/parent/report${q}`,
    );
  },
  redeemInvite: (code: string) =>
    apiParent<{
      ok: boolean;
      detail: string;
      pending_child_email: string;
      invite_id: string;
      parent: ParentUser;
    }>("/api/auth/parent/redeem-invite", { method: "POST", body: { code } }),
  linkStatus: () =>
    apiParent<{
      link_status: string;
      relationship?: ParentRelationship;
      child_email: string | null;
      children?: LinkedChildRef[];
      pending_child_email: string | null;
      pending_invite_id: string | null;
    }>("/api/auth/parent/link-status"),

  /** V6 — student signup starts OTP (name/email/password/grade only). */
  childSignup: (data: {
    name: string;
    email: string;
    password: string;
    grade: number;
  }) =>
    api<SignupPendingResponse>("/api/auth/child/signup", {
      method: "POST",
      body: data,
      auth: false,
    }),
};

export const authVerifyApi = {
  verifyEmail: (body: { email: string; code: string; role: "child" | "parent" }) =>
    api<AuthResponse | ParentAuthResponse>("/api/auth/verify-email", {
      method: "POST",
      body,
      auth: false,
    }),
  resendOtp: (body: { email: string; role: "child" | "parent" }) =>
    api<SignupPendingResponse>("/api/auth/resend-otp", {
      method: "POST",
      body,
      auth: false,
    }),
};

/** Forgot password — same OTP flow for child + parent. */
export const authForgotApi = {
  request: (body: { email: string; role: "child" | "parent" }) =>
    api<SignupPendingResponse>("/api/auth/forgot-password/request", {
      method: "POST",
      body,
      auth: false,
    }),
  resend: (body: { email: string; role: "child" | "parent" }) =>
    api<SignupPendingResponse>("/api/auth/forgot-password/resend", {
      method: "POST",
      body,
      auth: false,
    }),
  verify: (body: { email: string; role: "child" | "parent"; code: string }) =>
    api<{
      ok: boolean;
      email: string;
      role: "child" | "parent";
      reset_token: string;
      detail: string;
    }>("/api/auth/forgot-password/verify", {
      method: "POST",
      body,
      auth: false,
    }),
  reset: (body: {
    email: string;
    role: "child" | "parent";
    reset_token: string;
    new_password: string;
  }) =>
    api<{ ok: boolean; detail: string }>("/api/auth/forgot-password/reset", {
      method: "POST",
      body,
      auth: false,
    }),
};

export const familyApi = {
  createInvite: (parent_email?: string) =>
    api<{
      ok: boolean;
      invite_id: string;
      code: string;
      expires_at: string;
      expires_in_hours: number;
      email_sent?: boolean;
      email_detail?: string | null;
      emailed_to: string | null;
    }>("/api/family/invite", {
      method: "POST",
      body: { parent_email: parent_email || null },
    }),
  status: () => api<FamilyLinkStatus>("/api/family/status"),
  cancelInvite: (inviteId: string) =>
    api<{ ok: boolean; status: FamilyLinkStatus }>(
      `/api/family/invite/${encodeURIComponent(inviteId)}/cancel`,
      { method: "POST" },
    ),
  approve: (invite_id: string) =>
    api<{ ok: boolean; linked_parent_email: string; status: FamilyLinkStatus }>(
      "/api/family/approve",
      { method: "POST", body: { invite_id } },
    ),
  reject: (invite_id: string) =>
    api<{ ok: boolean; status: FamilyLinkStatus }>("/api/family/reject", {
      method: "POST",
      body: { invite_id },
    }),
  emailPendingAgain: (invite_id: string) =>
    api<{ ok: boolean; detail: string; emailed_to: string }>(
      `/api/family/pending/${encodeURIComponent(invite_id)}/email-again`,
      { method: "POST" },
    ),
  emailRespond: (token: string, action: "approve" | "reject") =>
    api<{
      ok: boolean;
      action: "approve" | "reject";
      detail: string;
      parent_email?: string;
      parent_name?: string;
    }>("/api/family/email-respond", {
      method: "POST",
      body: { token, action },
      auth: false,
    }),
  unlink: (body?: { invite_id?: string; parent_email?: string }) =>
    api<{ ok: boolean; status: FamilyLinkStatus }>("/api/family/unlink", {
      method: "POST",
      body: body || {},
    }),
};

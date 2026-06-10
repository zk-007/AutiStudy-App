/**
 * Time how long the API takes to produce a single chat reply on the
 * real RAG path. Useful for confirming there is no silent crash that
 * forces a slow fallback.
 */
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const ts = Date.now();
const email = `lat+${ts}@autistudy.test`;
const password = "TestPass123!";

async function api(path, init = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

console.log("[1] register");
const reg = await api("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name: "Latency Tester", email, password, grade: 4, role: "student" }),
});
const token = reg.token;
const auth = { Authorization: `Bearer ${token}` };

console.log("[2] create session");
const s = await api("/api/chat/sessions", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ subject: "Maths", grade: 4, language: "en" }),
});
const sid = s.id;

async function send(question) {
  const t0 = Date.now();
  const r = await api(`/api/chat/sessions/${sid}/messages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ content: question }),
  });
  const ms = Date.now() - t0;
  const reply = (r.reply || "").slice(0, 120).replace(/\s+/g, " ");
  console.log(`    ${String(ms).padStart(6)} ms  ::  ${reply}…`);
  return ms;
}

const questions = [
  "what is 2+5?",
  "what is 12 divided by 3?",
  "what is 1/2 + 1/4?",
];

console.log("[3] timing chat replies (each goes through RAG + GPT-4o-mini)");
for (const q of questions) {
  await send(q);
}

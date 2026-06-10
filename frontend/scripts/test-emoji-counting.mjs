/**
 * Quick end-to-end check of the emoji_counting visual aid track.
 * Registers a user, creates a session, sends "what is 3+5?",
 * then calls the image endpoint and verifies it returns kind=emoji_counting.
 */
const API = process.env.API_BASE_URL || "http://127.0.0.1:8000";
const ts = Date.now();
const email = `emoji+${ts}@autistudy.test`;
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
  body: JSON.stringify({ name: "Emoji Tester", email, password, grade: 4, role: "student" }),
});
const token = reg.token;
const auth = { Authorization: `Bearer ${token}` };

console.log("[2] create maths session");
const s = await api("/api/chat/sessions", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ subject: "Maths", grade: 4, language: "en" }),
});
const sid = s.id;
console.log("    session:", sid);

console.log("[3] send '3 + 5 = ?'");
const t0 = Date.now();
const msg = await api(`/api/chat/sessions/${sid}/messages`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ content: "3 + 5 = ?" }),
});
console.log(`    reply in ${Date.now() - t0}ms: "${(msg.assistant_message.content || "").slice(0, 80)}..."`);

console.log("[4] call image endpoint → expect emoji_counting");
const t1 = Date.now();
const aid = await api(`/api/chat/sessions/${sid}/image`, {
  method: "POST",
  headers: auth,
});
console.log(`    visual aid in ${Date.now() - t1}ms`);
console.log("    kind:", aid.kind);
if (aid.kind !== "emoji_counting") {
  console.error("[FAIL] expected kind=emoji_counting, got:", aid.kind);
  process.exit(1);
}
const ec = aid.emoji_counting;
console.log("    data:", JSON.stringify(ec, null, 2));

const checks = [
  ["n1", ec.n1 === 3],
  ["n2", ec.n2 === 5],
  ["op", ec.op === "+"],
  ["result", ec.result === 8],
  ["emoji present", !!ec.emoji],
  ["emoji2 present", !!ec.emoji2],
  ["title correct", ec.title === "3 + 5 = 8"],
];
let allOk = true;
for (const [label, ok] of checks) {
  console.log(`    ${ok ? "[OK]" : "[FAIL]"} ${label}`);
  if (!ok) allOk = false;
}
if (!allOk) process.exit(1);
console.log("\n[OK] emoji_counting end-to-end test passed.");

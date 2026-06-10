"""
Chat engine for the AutiStudy REST API (RAG-powered).
============================================================

This module is the bridge between the FastAPI server and the existing
RAG + LLM pipeline (`utils/llm.py` + `utils/rag.py`). The Streamlit app
calls those modules directly via Streamlit session state; this bridge
mirrors the same behaviour without requiring a Streamlit runtime, so the
React frontend gets *exactly* the same curriculum-grounded tutor:

  * hybrid retrieval (dense + BM25) over `OneSharedChromaDB / ptb_textbooks`
  * cross-encoder reranking
  * "topic NOT in textbook" + "wrong subject" detection
  * GPT-4o-mini with the autism-friendly system prompt
  * DALL·E image generation with math verification
  * OpenAI TTS for read-aloud

Boot sequence (called once on first use):
  1. Load OpenAI key from env / secrets.toml / plain key file.
  2. Export it as OPENAI_API_KEY so `utils.llm.get_openai_client()` finds it.
  3. Resolve the Chroma DB path to an absolute path so retrieval works no
     matter where the API server was started from.
  4. Lazy-import `utils.llm` (which lazy-loads embedder/reranker on first use).

If the heavy ML stack is missing, retrieval is skipped gracefully and the
tutor still answers (just without textbook grounding).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


# ────────────────────────────────────────────────────────────────────────────
# Paths & configuration
# ────────────────────────────────────────────────────────────────────────────

_HERE = Path(__file__).parent.resolve()

# Sources to check for the OpenAI key, in priority order:
#   1. OPENAI_API_KEY env var
#   2. .streamlit/secrets.toml  (single source of truth shared with Streamlit)
#   3. Loose plain-text key files dropped next to the project root.
_SECRETS_TOML = _HERE / ".streamlit" / "secrets.toml"
_PLAIN_KEY_FILES = [
    _HERE / ".streamlit" / "new_imp_fyp_open_ai_key.txt",
    _HERE / "openai_api_key.txt",
    _HERE / "OPENAI_API_KEY.txt",
]

# Where the curriculum vector store actually lives. The retriever notebooks
# wrote to OneSharedChromaDB / ptb_textbooks, so we point there explicitly
# (rag.py already defaults to this path, but we resolve to absolute here so
# the API server can be started from any cwd).
_CHROMA_PATH = _HERE / "OneSharedChromaDB"


# ────────────────────────────────────────────────────────────────────────────
# Key loading
# ────────────────────────────────────────────────────────────────────────────

def _load_from_secrets_toml() -> Optional[str]:
    """Read OPENAI_API_KEY from .streamlit/secrets.toml (if present)."""
    if not _SECRETS_TOML.exists():
        return None
    try:
        try:
            import tomllib  # type: ignore[import-not-found]
        except ModuleNotFoundError:  # Python 3.10 and below
            import tomli as tomllib  # type: ignore[import-not-found, no-redef]
        with _SECRETS_TOML.open("rb") as f:
            data = tomllib.load(f)
        candidate = data.get("OPENAI_API_KEY") or (data.get("openai") or {}).get("api_key")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    except Exception as err:
        print(f"[chat_engine] Could not read secrets.toml: {err}")
    return None


def _load_from_plain_file() -> Optional[str]:
    for path in _PLAIN_KEY_FILES:
        try:
            if path.exists():
                content = path.read_text(encoding="utf-8").strip()
                if content:
                    return content
        except OSError:
            continue
    return None


def _load_api_key() -> Optional[str]:
    """Resolve the OpenAI key from env var, secrets.toml, or a key file."""
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if key:
        return key
    return _load_from_secrets_toml() or _load_from_plain_file()


# ────────────────────────────────────────────────────────────────────────────
# Boot — runs once, on the first call into this module's public API
# ────────────────────────────────────────────────────────────────────────────

_booted = False
_llm_module: Any = None  # populated by _boot() if utils.llm imports cleanly
_have_key = False


def _boot() -> None:
    """Idempotent one-time setup: env vars + lazy import of utils.llm."""
    global _booted, _llm_module, _have_key
    if _booted:
        return
    _booted = True

    # 1. Plant the OpenAI key in the env so utils.llm.get_openai_client picks
    #    it up (it tries env first, then st.secrets which would error here).
    api_key = _load_api_key()
    if api_key:
        os.environ.setdefault("OPENAI_API_KEY", api_key)
        _have_key = True
    else:
        print("[chat_engine] No OpenAI API key found — tutor will use fallback replies.")

    # 2. Pin the Chroma DB path to absolute so retrieval works regardless of cwd.
    if _CHROMA_PATH.exists():
        os.environ.setdefault("CHROMA_DB_PATH", str(_CHROMA_PATH))
    else:
        print(f"[chat_engine] Chroma DB not found at {_CHROMA_PATH} — RAG disabled.")

    # 3. Lazy-import utils.llm. If the ML stack is missing we keep going in
    #    "no-RAG" mode rather than crashing the API server.
    try:
        from utils import llm as llm_module  # noqa: WPS433 — intentional lazy import
        _llm_module = llm_module
    except Exception as err:
        print(f"[chat_engine] utils.llm unavailable ({err}) — falling back to direct OpenAI.")
        _llm_module = None


# ────────────────────────────────────────────────────────────────────────────
# Direct OpenAI fallback (used only if utils.llm couldn't import)
# ────────────────────────────────────────────────────────────────────────────

_direct_client = None


def _get_direct_client():
    """Plain OpenAI client used as a last-resort when utils.llm isn't available."""
    global _direct_client
    if _direct_client is not None:
        return _direct_client
    if not _have_key:
        return None
    try:
        from openai import OpenAI
        _direct_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    except Exception as err:
        print(f"[chat_engine] OpenAI client init failed: {err}")
        _direct_client = None
    return _direct_client


_FALLBACK_SYSTEM_EN = (
    "You are AutiStudy AI Tutor — a patient, kind tutor for autistic students "
    "in grades 4-7. Use short, clear sentences. Break ideas into small steps. "
    "Use everyday examples. Celebrate small wins. Student grade: {grade}. "
    "Subject: {subject}."
)
_FALLBACK_SYSTEM_UR = (
    "آپ آٹی اسٹڈی AI ٹیوٹر ہیں — جماعت 4 تا 7 کے آٹسٹک طلباء کے لیے ایک "
    "صبر کرنے والا، مہربان معاون۔ آسان مختصر جملے استعمال کریں۔ ہمیشہ اردو "
    "میں جواب دیں۔ طالب علم کی جماعت: {grade}۔ مضمون: {subject}۔"
)


_FORMAT_INSTRUCTIONS = {
    "simplified": (
        "\n\nIMPORTANT: The student found the last explanation hard. "
        "Use VERY simple words, short sentences, and relatable examples. "
        "Keep the answer brief (max 6 sentences)."
    ),
    "step_by_step_flowchart": (
        "\n\nIMPORTANT: Explain using a numbered step-by-step format like a flowchart. "
        "Each step should be on its own line, short (one sentence). "
        "Use ➡️ arrows or numbers. Keep it visual and easy to follow."
    ),
    "with_visual_description": (
        "\n\nIMPORTANT: Include a short visual description or analogy that paints a picture "
        "in the student's mind. Describe what it looks like, sounds like, or feels like."
    ),
    "normal": "",
}


def _direct_reply(*, user_message: str, grade: int, subject: str,
                  history: List[dict], language: str,
                  preferred_format: str = "normal") -> str:
    """Plain GPT call without RAG (used only if utils.llm failed to import)."""
    client = _get_direct_client()
    if client is None:
        return _no_key_reply(user_message, language)

    template = _FALLBACK_SYSTEM_UR if language == "ur" else _FALLBACK_SYSTEM_EN
    format_hint = _FORMAT_INSTRUCTIONS.get(preferred_format, "")
    sys_content = template.format(grade=grade, subject=subject) + format_hint
    messages: List[dict] = [{"role": "system", "content": sys_content}]
    for msg in history[-10:]:
        if msg.get("role") in {"user", "assistant"} and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=900,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as err:
        print(f"[chat_engine] direct LLM error: {err}")
        return _llm_error_reply(language)


# ────────────────────────────────────────────────────────────────────────────
# Public API
# ────────────────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    """True if the tutor can produce real LLM responses right now."""
    _boot()
    return _have_key


def rag_status() -> Dict[str, Any]:
    """Diagnostic snapshot of the retrieval stack (for /api/chat/config)."""
    _boot()
    status: Dict[str, Any] = {"have_key": _have_key, "rag_available": False}
    if _llm_module is None:
        return status
    try:
        from utils import rag
        info = rag.check_db_status()
        status["rag_available"] = bool(
            info.get("chroma_connected") and info.get("total_vectors", 0) > 0
        )
        status.update({
            "total_vectors": info.get("total_vectors", 0),
            "chroma_path": info.get("chroma_path"),
            "embedder_loaded": info.get("embedder_loaded", False),
            "reranker_loaded": info.get("reranker_loaded", False),
        })
    except Exception as err:
        status["rag_error"] = str(err)
    return status


def generate_reply(
    *,
    user_message: str,
    grade: int,
    subject: str,
    history: Iterable[dict],
    language: str = "en",
    preferred_format: str = "normal",
) -> str:
    """
    Produce a tutor reply for `user_message`, grounded in the curriculum
    when possible.

    Delegates to `utils.llm.generate_response(..., use_rag=True)` so the
    React chat goes through the *same* hybrid-retrieval + reranker + GPT
    pipeline as the Streamlit app. Falls back to a direct GPT call if
    the ML stack isn't installed, and to a friendly placeholder if no
    OpenAI key is configured.
    """
    _boot()
    history_list = [m for m in history if m.get("role") in {"user", "assistant"}]

    if not _have_key:
        return _no_key_reply(user_message, language)

    format_hint = _FORMAT_INSTRUCTIONS.get(preferred_format, "")

    if _llm_module is not None:
        try:
            text = _llm_module.generate_response(
                user_message=user_message,
                grade=grade,
                subject=subject,
                chat_history=history_list,
                use_rag=True,
                language=language,
                extra_system_hint=format_hint,  # injected into system prompt
            )
            text = (text or "").strip()
            if text:
                return text
        except Exception as err:
            print(f"[chat_engine] utils.llm.generate_response failed: {err}")

    return _direct_reply(
        user_message=user_message,
        grade=grade,
        subject=subject,
        history=history_list,
        language=language,
        preferred_format=preferred_format,
    )


def generate_visual_aid(
    *,
    user_message: str,
    grade: int,
    subject: str,
    history: Iterable[dict],
    language: str = "en",
) -> Optional[Dict[str, Any]]:
    """
    Produce a visual aid for `user_message` using the 3-way router.

    The router (`utils.visual_aids.classify_visual_request`) picks one of:

      * ``"countable"`` → DALL·E illustration with countable objects.
        Built from a deterministic, locked-down prompt so we don't ask the
        model to "imagine" a layout (which is where miscounts come from).

      * ``"symbolic"`` → no image at all. Instead we ask GPT for a JSON
        worked-solution card; the React frontend renders each step's LaTeX
        with KaTeX so fractions, exponents, etc. typeset perfectly.

      * ``"concept"`` → fall back to the existing `utils.llm.generate_image`
        which uses GPT to plan a definition / workflow / comparison diagram.

    Returns one of:

      * ``{"kind": "image",       "image_url": "https://…"}``
      * ``{"kind": "math_steps",  "math_steps": {...}}``
      * ``None`` if everything failed (caller should surface a friendly error).
    """
    _boot()
    if not _have_key:
        return None

    # We need utils.visual_aids; it has no heavy deps so this is cheap.
    try:
        from utils import visual_aids
    except Exception as err:
        print(f"[chat_engine] visual_aids import failed: {err}")
        visual_aids = None  # noqa: F841 — handled below

    history_list = [m for m in history if m.get("role") in {"user", "assistant"}]
    track = "concept"
    if visual_aids is not None:
        track = visual_aids.classify_visual_request(
            user_message, history_list, subject,
        )
    print(f"[chat_engine] visual track for {user_message[:60]!r} -> {track}")

    history_snippet = visual_aids._last_assistant_text(history_list) if visual_aids else ""

    # ── Track A: countable arithmetic → in-browser emoji illustration ────────
    if track == "countable" and visual_aids is not None:
        emoji_plan = visual_aids.build_countable_emoji_data(user_message)
        print(f"[chat_engine] countable emoji plan: {emoji_plan is not None}")
        if emoji_plan is not None:
            return {"kind": "emoji_counting", "emoji_counting": emoji_plan.to_dict()}

    # ── Track A2: factor tree (HCF / LCM / prime factorization) ─────────────
    if track == "factor_tree" and visual_aids is not None:
        ft = visual_aids.build_factor_tree_data(user_message, history_snippet)
        print(f"[chat_engine] factor_tree data: {ft is not None}")
        if ft is not None:
            return {"kind": "factor_tree", "factor_tree": ft.to_dict()}

    # ── Track A3: fraction bar (visual fraction diagram) ────────────────────
    if track == "fraction_bar" and visual_aids is not None:
        fb = visual_aids.build_fraction_bar_data(user_message)
        print(f"[chat_engine] fraction_bar data: {fb is not None}")
        if fb is not None:
            return {"kind": "fraction_bar", "fraction_bar": fb.to_dict()}

    # ── Track A4: number line (integers / signed arithmetic) ─────────────────
    if track == "number_line" and visual_aids is not None:
        nl = visual_aids.build_number_line_data(user_message, history_snippet)
        print(f"[chat_engine] number_line data: {nl is not None}")
        if nl is not None:
            return {"kind": "number_line", "number_line": nl.to_dict()}

    # ── Track A5: bar/pie chart (data handling) ──────────────────────────────
    if track == "bar_chart" and visual_aids is not None and _llm_module is not None:
        try:
            client = _llm_module.get_openai_client()
            bc = visual_aids.build_bar_chart_data(user_message, history_snippet, client)
            print(f"[chat_engine] bar_chart data: {bc is not None}")
            if bc is not None:
                return {"kind": "bar_chart", "bar_chart": bc.to_dict()}
        except Exception as err:
            print(f"[chat_engine] bar_chart build failed: {err}")

    # ── Track A6: percentage bar ──────────────────────────────────────────────
    if track == "percentage_bar" and visual_aids is not None:
        pb = visual_aids.build_percentage_bar_data(user_message, history_snippet)
        print(f"[chat_engine] percentage_bar data: {pb is not None}")
        if pb is not None:
            return {"kind": "percentage_bar", "percentage_bar": pb.to_dict()}

    # ── Track A7: times table grid ────────────────────────────────────────────
    if track == "times_table" and visual_aids is not None:
        tt = visual_aids.build_times_table_data(user_message, history_snippet)
        print(f"[chat_engine] times_table data: {tt is not None}")
        if tt is not None:
            return {"kind": "times_table", "times_table": tt.to_dict()}

    # ── Track A8: geometry shapes ─────────────────────────────────────────────
    if track == "geometry" and visual_aids is not None:
        try:
            client = _llm_module.get_openai_client() if _llm_module else None
            geo = visual_aids.build_geometry_data(user_message, history_snippet, client)
            print(f"[chat_engine] geometry data: {geo is not None}")
            if geo is not None:
                return {"kind": "geometry", "geometry": geo.to_dict()}
        except Exception as err:
            print(f"[chat_engine] geometry build failed: {err}")

    # ── Track A9: ratio / balance scale ──────────────────────────────────────
    if track == "ratio" and visual_aids is not None:
        ratio = visual_aids.build_ratio_data(user_message, history_snippet)
        print(f"[chat_engine] ratio data: {ratio is not None}")
        if ratio is not None:
            return {"kind": "ratio", "ratio": ratio.to_dict()}

    # ── Track B: symbolic math → KaTeX step card ──────────────────────────
    if track == "symbolic" and visual_aids is not None and _llm_module is not None:
        try:
            client = _llm_module.get_openai_client()
            print(f"[chat_engine] symbolic client: {client is not None}")
            card = visual_aids.generate_math_steps(
                question=user_message,
                history=history_list,
                language=language,
                client=client,
            )
            print(f"[chat_engine] symbolic card: {card is not None}")
            if card is not None:
                return {"kind": "math_steps", "math_steps": card.to_dict()}
        except Exception as err:
            import traceback
            print(f"[chat_engine] math step card failed: {err}")
            traceback.print_exc()
        # If step extraction failed, fall through and try a generic image so
        # the student isn't left with nothing.

    # ── Track C: concept diagram (existing GPT-planned image) ─────────────
    if _llm_module is not None:
        try:
            url = _llm_module.generate_image(
                question=user_message,
                grade=grade,
                subject=subject,
                chat_history=history_list,
            )
            if url:
                return {"kind": "image", "image_url": url}
        except Exception as err:
            print(f"[chat_engine] concept image render failed: {err}")

    return None


# Back-compat alias: older callers may still import `generate_image`.
# It now returns just the URL string (or None) so existing code keeps working,
# and the new richer dict-returning entry point lives at `generate_visual_aid`.
def generate_image(
    *,
    user_message: str,
    grade: int,
    subject: str,
    history: Iterable[dict],
) -> Optional[str]:
    """Legacy single-purpose wrapper — returns only an image URL.

    New code should call `generate_visual_aid` so it can also receive the
    KaTeX step card for fraction/algebra questions.
    """
    aid = generate_visual_aid(
        user_message=user_message,
        grade=grade,
        subject=subject,
        history=history,
    )
    if aid and aid.get("kind") == "image":
        return aid.get("image_url")
    return None


def generate_speech_b64(text: str, language: str = "en") -> Optional[str]:
    """
    Produce a base64-encoded MP3 of `text` using OpenAI TTS.
    Returns None if TTS isn't available.
    """
    _boot()
    if not _have_key or _llm_module is None:
        return None
    try:
        return _llm_module.text_to_speech_base64(text=text, language=language)
    except Exception as err:
        print(f"[chat_engine] text_to_speech failed: {err}")
        return None


# ────────────────────────────────────────────────────────────────────────────
# Friendly fallback messages
# ────────────────────────────────────────────────────────────────────────────

def _no_key_reply(user_message: str, language: str) -> str:
    if language == "ur":
        return (
            "ہیلو! میں آپ کا AI ٹیوٹر ہوں، لیکن ابھی پوری طرح ترتیب نہیں دیا گیا۔ "
            "اپنے استاد سے OpenAI کی API کلید سیٹ کرنے کو کہیں۔ "
            f'آپ نے پوچھا: "{user_message[:120]}".'
        )
    snippet = user_message[:120]
    return (
        "Hi! I'm your AI tutor, but I'm not fully set up yet. "
        "Please ask your teacher to add an OpenAI API key so I can give you a "
        "proper answer.\n\n"
        f'In the meantime — I heard you ask: "{snippet}". '
        "That's a great question, and I'll be ready to help with it as soon as "
        "I'm online!"
    )


def _llm_error_reply(language: str) -> str:
    if language == "ur":
        return "معذرت، ابھی سوچنے میں مشکل ہو رہی ہے۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔"
    return (
        "I'm having a little trouble thinking right now. "
        "Please try again in a moment."
    )

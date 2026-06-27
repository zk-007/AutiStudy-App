import os
import re
import json
import base64
import uuid
from typing import List, Dict, Optional, Any

from openai import OpenAI

from utils.rag import query_knowledge_base, format_context_for_prompt
from utils.secrets import get_secret


# =========================================================
# OPENAI KEY SETTINGS
# =========================================================
# Put your OpenAI key file path here if you are storing the key in a text file.
# Example:
# OPENAI_API_KEY_FILE = r"D:\AutoStudy\openai_api_key.txt"
OPENAI_API_KEY_FILE = r"PASTE_YOUR_OPENAI_KEY_FILE_PATH_HERE"


def _read_api_key_from_file(file_path: str) -> str:
    """Read API key from a text file."""
    try:
        if (
            file_path
            and file_path != "PASTE_YOUR_OPENAI_KEY_FILE_PATH_HERE"
            and os.path.exists(file_path)
        ):
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception as e:
        print(f"Error reading API key file: {e}")
    return ""


# Module-level cache for the OpenAI client.
#
# Why cache? `OpenAI()` builds a fresh httpx connection pool every time it's
# constructed. Before this cache, every chat message in the React API spun
# up a brand-new pool, paid TLS handshake cost, and threw the pool away on
# return — adding hundreds of ms (sometimes seconds) per message and
# leaving sockets in TIME_WAIT under load.
_OPENAI_CLIENT: Optional["OpenAI"] = None
_OPENAI_KEY: Optional[str] = None

# Hard upper bound on a single OpenAI HTTP call. Without this, an upstream
# blip can leave the request hanging for the full default (10 minutes!),
# which from the student's POV looks exactly like the app being frozen.
# 60 seconds is comfortably above the typical gpt-4o-mini latency (~1-10s)
# while still failing fast on real outages.
_OPENAI_TIMEOUT_SECONDS = 60.0


def _resolve_api_key() -> str:
    """Resolve the OpenAI API key from env → config/secrets.toml → key file."""
    key = get_secret("OPENAI_API_KEY", "")
    if key:
        return key
    return _read_api_key_from_file(OPENAI_API_KEY_FILE) or ""


# Module-level singletons — populated by get_openai_client() on first call.
# The httpx.Client is separated from the OpenAI wrapper so that SSL
# initialisation (which can take 60 s on Windows the first time it loads
# the system trust store) happens exactly ONCE, at startup, rather than on
# every request.
_OPENAI_CLIENT: Optional[OpenAI] = None
_OPENAI_HTTP_CLIENT = None  # httpx.Client — kept alive to reuse the SSL context
_OPENAI_KEY: str = ""


def get_openai_client():
    """Return a cached OpenAI client, or None if no API key.

    The httpx.Client (and its SSL context) is created ONCE and reused across
    all calls. On Windows, initialising the SSL trust store can take up to 60 s
    on the first call; caching prevents that cost from being paid on every
    chat message.

    Connection keep-alive is disabled so requests always open a fresh TCP
    connection to OpenAI (avoids stale half-open sockets that cause silent
    hangs), while still reusing the expensive SSL context.

    Call this once from the API startup warmup so the 60-second cost is paid
    in the background before any student sends a message.
    """
    global _OPENAI_CLIENT, _OPENAI_HTTP_CLIENT, _OPENAI_KEY
    import httpx

    api_key = _resolve_api_key()
    if not api_key:
        return None

    # Rebuild if the key was rotated.
    if _OPENAI_CLIENT is not None and _OPENAI_KEY == api_key:
        return _OPENAI_CLIENT

    # Create the httpx transport once — this is where the slow SSL init happens
    # on Windows (trust-store loading can take 60+ s on first connection).
    #
    # Key settings:
    #  keepalive_expiry=120  — keep connections alive for 2 minutes (default
    #                           is only 5 s, which is too short: the connection
    #                           would expire between the startup ping and the
    #                           first student message, forcing a new 60+ s TLS
    #                           handshake for every request).
    #  max_keepalive_connections=5  — pool size; any call reuses a live conn.
    _OPENAI_HTTP_CLIENT = httpx.Client(
        transport=httpx.HTTPTransport(
            limits=httpx.Limits(
                max_keepalive_connections=5,
                max_connections=10,
                keepalive_expiry=120,  # 2 minutes (default is only 5 s)
            ),
        ),
        timeout=httpx.Timeout(_OPENAI_TIMEOUT_SECONDS),
    )
    _OPENAI_CLIENT = OpenAI(
        api_key=api_key,
        timeout=_OPENAI_TIMEOUT_SECONDS,
        http_client=_OPENAI_HTTP_CLIENT,
    )
    _OPENAI_KEY = api_key
    return _OPENAI_CLIENT


# =========================================================
# TEXT TUTOR PROMPT
# =========================================================
SYSTEM_PROMPT_EN = """You are AutiStudy AI Tutor, a friendly and patient educational assistant designed specifically for students with autism in grades 4-7 in Pakistan.

Your teaching style:
- Use simple, clear language appropriate for the student's grade level
- Break down complex concepts into smaller, manageable steps
- Be patient, encouraging, and supportive
- Use examples from everyday life when possible
- Provide visual descriptions when helpful
- Repeat important points when needed
- Celebrate small achievements
- Avoid overwhelming the student with too much information at once

Current Context:
- Student Grade: {grade}
- Subject: {subject}

When answering questions:
1. First acknowledge the student's question
2. Give a SHORT first answer only: max 4–6 sentences (~120 words). Do not dump everything at once.
3. If more detail is needed, end with exactly: "📖 Read this part first! Say **tell me more** when you're ready for the next part."
4. Use relevant examples from the current subject
5. Do NOT ask "did you understand?" — the adaptive camera agent handles that separately
6. Encourage the student

If you have reference material provided, use it to give accurate answers about the Pakistan curriculum.
If you don't have specific information, be honest but helpful.

Formatting math:
- Wrap inline math with single dollars, e.g. $\\frac{1}{2}$, $a^2 + b^2 = c^2$, $3 \\times 4 = 12$.
- Wrap standalone equations with double dollars on their own lines, e.g. $$\\frac{2}{4} + \\frac{5}{6} = \\frac{4}{3}$$.
- Never wrap math in plain parentheses or square brackets — always use the dollar-sign form so it renders as real symbols.
- Use \\frac{a}{b} for fractions, \\times for multiplication, \\div for division, ^ for powers, and _ for subscripts.

Math methods:
- Division ≤20: one-step recall. Dividend 21-99: SHORT DIVISION (digit by digit). Dividend ≥100: LONG DIVISION (divide-multiply-subtract-bring down). NEVER list multiples, skip-count, or use repeated addition/subtraction for dividends ≥21.
- Multiplication: times table for single digits; column method for multi-digit.
- Addition/subtraction ≤20: counting on/back fine. Larger: column method with carrying/borrowing.

Emoji counting: when BOTH numbers ≤10 in an addition or subtraction, include one emoji line in your reply so the student can count along. Example for 3+5: 🍎🍎🍎 + 🌟🌟🌟🌟🌟 = 🍎🍎🍎🌟🌟🌟🌟🌟 (8). Example for 7−3: 🎈🎈🎈🎈🎈🎈🎈 → remove 🎈🎈🎈 → 🎈🎈🎈🎈 (4 left).

Remember: Your goal is to make learning enjoyable and accessible — but also to teach methods that will still work when the numbers get bigger.
"""

SYSTEM_PROMPT_UR = """آپ آٹی اسٹڈی AI ٹیوٹر ہیں، ایک دوستانہ اور صبر کرنے والے تعلیمی معاون جو خاص طور پر پاکستان میں جماعت 4-7 کے آٹزم والے طلباء کے لیے ڈیزائن کیا گیا ہے۔

آپ کا تدریسی انداز:
- طالب علم کی جماعت کی سطح کے مطابق آسان، واضح زبان استعمال کریں
- پیچیدہ تصورات کو چھوٹے، قابل انتظام مراحل میں تقسیم کریں
- صبر کریں، حوصلہ افزائی کریں، اور معاون بنیں
- جب ممکن ہو روزمرہ زندگی کی مثالیں استعمال کریں
- جب مددگار ہو تو بصری وضاحت فراہم کریں
- اہم نکات کو ضرورت کے مطابق دہرائیں
- چھوٹی کامیابیوں کا جشن منائیں
- ایک وقت میں بہت زیادہ معلومات سے طالب علم کو مغلوب نہ کریں

موجودہ سیاق و سباق:
- طالب علم کی جماعت: {grade}
- مضمون: {subject}

سوالات کا جواب دیتے وقت:
1. پہلے طالب علم کے سوال کو تسلیم کریں
2. پہلے مختصر جواب دیں: زیادہ سے زیادہ 4–6 جملے (~120 الفاظ)
3. اگر مزید تفصیل چاہیے تو آخر میں لکھیں: "📖 پہلے یہ حصہ پڑھیں! اگلا حصہ چاہیے تو **مزید بتائیں** کہیں۔"
4. موجودہ مضمون سے متعلقہ مثالیں استعمال کریں
5. "کیا آپ سمجھ گئے؟" جیسے سوالات نہ پوچھیں — سمجھ کی جانچ الگ adaptive camera agent کرتا ہے
6. طالب علم کی حوصلہ افزائی کریں

اگر آپ کے پاس حوالہ مواد فراہم کیا گیا ہے، تو اسے پاکستانی نصاب کے بارے میں درست جوابات دینے کے لیے استعمال کریں۔
اگر آپ کے پاس مخصوص معلومات نہیں ہیں، تو ایماندار مگر مددگار بنیں۔

ریاضی کی فارمیٹنگ:
- لائن کے اندر ریاضی کو ایک ڈالر کے نشان میں لپیٹیں، مثلاً $\\frac{1}{2}$ یا $3 \\times 4 = 12$۔
- مکمل مساوات کو الگ سطر میں ڈبل ڈالر کے نشان میں لکھیں، مثلاً $$\\frac{2}{4} + \\frac{5}{6} = \\frac{4}{3}$$۔
- ریاضی کو کبھی بھی صرف ( ) یا [ ] میں نہ لکھیں — ہمیشہ $ کا استعمال کریں تاکہ علامتیں صحیح طور پر ظاہر ہوں۔

ریاضی کے طریقے:
- تقسیم ≤20: ایک قدم۔ Dividend 21-99: مختصر تقسیم (ہندسہ بہ ہندسہ)۔ Dividend ≥100: لمبی تقسیم (تقسیم-ضرب-تفریق-نیچے لائیں)۔ 21 سے بڑے dividend کے لیے ضرب کی فہرست، گنتی، یا بار بار جمع/تفریق ہرگز نہ کریں۔
- ضرب: ایک ہندسہ = جدول؛ کثیر ہندسہ = کالم کا طریقہ۔
- جمع/تفریق ≤20: گنتی ٹھیک ہے۔ بڑے نمبر: کالم کا طریقہ۔

ایموجی گنتی: جب دونوں نمبر ≤10 ہوں تو جواب میں ایک ایموجی لائن شامل کریں۔ مثال 3+5: 🍎🍎🍎 + 🌟🌟🌟🌟🌟 = 🍎🍎🍎🌟🌟🌟🌟🌟 (کل 8)۔ مثال 7−3: 🎈🎈🎈🎈🎈🎈🎈 → 🎈🎈🎈 ہٹائیں → 🎈🎈🎈🎈 (4 باقی)۔

یاد رکھیں: آپ کا مقصد سیکھنے کو خوشگوار بنانا ہے — لیکن ایسے طریقے سکھائیں جو بڑے نمبروں کے لیے بھی کام کریں۔

اہم: آپ کو ہمیشہ اردو میں جواب دینا ہے۔ تمام وضاحتیں، مثالیں اور جوابات اردو میں ہونے چاہئیں۔
"""


def get_system_prompt(language: str = "en") -> str:
    """Get the system prompt based on selected language"""
    if language == "ur":
        return SYSTEM_PROMPT_UR
    return SYSTEM_PROMPT_EN


def _build_off_topic_system_prompt(
    grade: int,
    subject: str,
    language: str,
    query_related_to_subject: bool,
) -> str:
    """Prompt for questions outside the textbook — no tutoring ladder / tell-me-more."""
    from utils.book_parser import format_book_units_list

    units = format_book_units_list(grade, subject, language)
    units_block = units if units else (
        "  (Unit list unavailable — ask your teacher for the chapter names.)"
        if language == "en"
        else "  (یونٹ کی فہرست دستیاب نہیں — اپنے استاد سے باب کے نام پوچھیں۔)"
    )

    if language == "ur":
        if not query_related_to_subject:
            opener = f"یہ سوال {subject} سے متعلق نہیں لگتا۔"
        else:
            opener = f"یہ موضوع جماعت {grade} کی {subject} نصابی کتاب میں نہیں ہے۔"
        return f"""آپ آٹی اسٹڈی AI ٹیوٹر ہیں — پاکستان میں جماعت 4-7 کے طلباء کے لیے۔

{opener}

جواب EXACTLY اس ترتیب میں دیں (آسان اردو):
1. ایک جملے میں واضح کریں کہ یہ سوال کتاب / نصاب سے باہر ہے۔
2. سرخی: "آپ کی جماعت {grade} {subject} کتاب کے موضوعات:"
3. یہ فہرست بالکل ویسی ہی لکھیں:
{units_block}
4. زیادہ سے زیادہ دو مختصر جملوں میں سوال سے تھوڑا سا تعلق رکھتے ہوئے hint دیں (اختیاری)۔
5. آخر میں بالکل یہ لکھیں: "براہ کرم اوپر دی گئی کتاب کے موضوعات میں سے کوئی اور سوال پوچھیں۔ 📚"

قواعد:
- step-by-step tutoring نہ کریں۔
- "مزید بتائیں" یا "tell me more" نہ لکھیں۔
- "کیا آپ سمجھ گئے؟" نہ پوچھیں۔
- پورا جواب ~150 الفاظ سے کم رکھیں۔
"""

    if not query_related_to_subject:
        opener = f"This question does NOT seem to be about {subject}."
    else:
        opener = f"This topic is NOT in the student's Grade {grade} {subject} textbook."

    return f"""You are AutiStudy AI Tutor for autistic students in grades 4-7 in Pakistan.

{opener}

Reply in EXACTLY this structure (friendly, simple English):
1. One clear sentence saying this question is outside / not in their textbook.
2. A heading line: "Topics in your Grade {grade} {subject} book:"
3. Copy this list exactly:
{units_block}
4. At most TWO short sentences with a tiny hint related to their question (optional).
5. End with exactly: "Please ask me another question from your textbook topics above. 📚"

RULES:
- Do NOT use step-by-step tutoring.
- Do NOT say "tell me more" or offer to continue explaining.
- Do NOT ask "did you understand?"
- Keep the whole reply under ~150 words.
"""


def generate_response(
    user_message: str,
    grade: int,
    subject: str,
    chat_history: List[Dict],
    use_rag: bool = True,
    language: str = None,
    extra_system_hint: str = "",
    return_meta: bool = False,
):
    """Generate a response using GPT-4o-mini with optional RAG."""
    if language is None:
        language = "en"

    def _wrap(text: str, *, is_relevant: bool = True, query_related: bool = True):
        if return_meta:
            return {
                "text": text,
                "is_relevant": is_relevant,
                "query_related_to_subject": query_related,
            }
        return text

    client = get_openai_client()
    if not client:
        if language == "ur":
            return _wrap(
                "معذرت، لیکن میں ابھی صحیح طریقے سے ترتیب نہیں ہوں۔ براہ کرم اپنے استاد سے OpenAI API کلید سیٹ اپ کرنے کو کہیں۔",
                is_relevant=False,
            )
        return _wrap(
            "I'm sorry, but I'm not properly configured yet. "
            "Please ask your teacher to set up the OpenAI API key.",
            is_relevant=False,
        )

    context = ""
    is_from_textbook = True
    query_related_to_subject = True
    
    if use_rag:
        try:
            rag_result = query_knowledge_base(user_message, grade, subject)
            documents = rag_result.get("documents", [])
            is_from_textbook = rag_result.get("is_relevant", False)
            relevance_score = rag_result.get("relevance_score", 0)
            query_related_to_subject = rag_result.get("query_related_to_subject", True)
            
            if documents and is_from_textbook:
                context = format_context_for_prompt(documents)
                print(f"Retrieved {len(documents)} documents for query: {user_message[:50]}...")
            else:
                print(f"Topic NOT in textbook (relevance: {relevance_score:.3f}, related: {query_related_to_subject}): {user_message[:50]}...")
        except Exception as e:
            print(f"RAG retrieval error: {e}")
            context = ""
            is_from_textbook = False

    # Get language-specific system prompt.
    #
    # We use plain str.replace() rather than str.format() because the prompt
    # body contains LaTeX examples like "$\frac{1}{2}$" and "$3 \times 4$".
    # str.format() interprets every "{…}" as a placeholder and would crash
    # with `Replacement index 1 out of range for positional args tuple` on
    # the "{1}" inside "\frac{1}{2}". When that crash fires we lose the RAG
    # answer entirely and the engine has to fall back to a second OpenAI
    # call, doubling the user's wait. Plain replace is brace-safe.
    system_prompt = (
        get_system_prompt(language)
        .replace("{grade}", str(grade))
        .replace("{subject}", str(subject))
    )

    # Add context or not-in-textbook instruction
    if context and is_from_textbook:
        if language == "ur":
            system_prompt += f"\n\nمتعلقہ تعلیمی مواد:\n{context}"
        else:
            system_prompt += f"\n\nRelevant learning material:\n{context}"
    elif not is_from_textbook:
        system_prompt = _build_off_topic_system_prompt(
            grade, subject, language, query_related_to_subject
        )

    # Tutoring-agent format hints only apply to on-textbook questions.
    if extra_system_hint and is_from_textbook:
        system_prompt += extra_system_hint

    messages = [{"role": "system", "content": system_prompt}]

    for msg in chat_history[-10:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })

    messages.append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=350 if not is_from_textbook else 600,
        )
        text = response.choices[0].message.content
        return _wrap(
            text,
            is_relevant=is_from_textbook,
            query_related=query_related_to_subject,
        )
    except Exception as e:
        if language == "ur":
            return _wrap(
                f"مجھے ابھی سوچنے میں مشکل ہو رہی ہے۔ دوبارہ کوشش کرتے ہیں! (خرابی: {str(e)})",
                is_relevant=False,
            )
        return _wrap(
            f"I'm having trouble thinking right now. Let's try again! (Error: {str(e)})",
            is_relevant=False,
        )


# =========================================================
# "HOW" QUESTION DETECTION AND CONTEXT EXTRACTION
# =========================================================

HOW_QUESTION_PATTERNS = [
    r"^how\??$",
    r"^how is that\??$",
    r"^how does that work\??$",
    r"^how do you do that\??$",
    r"^show me how\??$",
    r"^can you show me\??$",
    r"^explain how\??$",
    r"^how did you get that\??$",
    r"^how does it work\??$",
    r"^why\??$",
    r"^why is that\??$",
]


def is_followup_how_question(user_message: str) -> bool:
    """
    Detect if the user is asking a short follow-up "how" question
    that refers to the previous conversation.
    """
    msg = user_message.strip().lower()
    
    # Check against patterns
    for pattern in HOW_QUESTION_PATTERNS:
        if re.match(pattern, msg):
            return True
    
    # Short "how" questions (less than 5 words starting with how/why/show)
    words = msg.split()
    if len(words) <= 5 and words[0] in ["how", "why", "show", "explain"]:
        return True
    
    return False


def get_context_from_history(chat_history: List[Dict], user_message: str) -> str:
    """
    For follow-up "how" questions, extract the relevant context 
    from the previous conversation to understand what the user is asking about.
    """
    if not chat_history:
        return user_message
    
    # Get the last few exchanges
    relevant_messages = []
    for msg in chat_history[-4:]:  # Last 2 Q&A pairs
        if msg.get("role") == "user":
            relevant_messages.append(f"Student asked: {msg.get('content', '')}")
        elif msg.get("role") == "assistant":
            # Get first 200 chars of assistant response
            content = msg.get("content", "")[:200]
            relevant_messages.append(f"Tutor explained: {content}")
    
    context = "\n".join(relevant_messages)
    return f"Previous conversation:\n{context}\n\nStudent now asks: {user_message}"


def should_auto_generate_image(user_message: str, subject: str, chat_history: List[Dict]) -> bool:
    """
    Determine if we should automatically generate an image for this question.
    
    DISABLED: Images are now only generated when user clicks ImageAid button.
    This function always returns False.
    """
    # Auto-generation disabled - user must click ImageAid button
    return False


def get_image_context(user_message: str, chat_history: List[Dict], subject: str) -> str:
    """
    Get the full context for image generation, especially for follow-up questions.
    """
    # If it's a follow-up "how" question, include the previous topic
    if is_followup_how_question(user_message) and chat_history:
        # Find the last user question that was substantive
        for msg in reversed(chat_history[:-1]):  # Exclude current message
            if msg.get("role") == "user":
                prev_question = msg.get("content", "")
                if len(prev_question) > 10:  # Substantive question
                    return f"{prev_question} - explain how this works visually"
        
    return user_message


# =========================================================
# IMAGE PROMPT BUILDER
# =========================================================
IMAGE_BUILDER_SYSTEM_PROMPT = """You are VisualPromptBuilder for an autism-friendly learning app.

Your job:
Convert the student's question into a SIMPLE, LOW-CLUTTER educational image plan.

The final image must be:
- beginner-friendly
- visually calm
- white background
- simple flat vector style
- clearly colorful, but soft and not harsh
- easy to understand in one look

STRICT RULES:
1. Use ONLY 3 to 6 relevant visual elements. Never more than 6.
2. No decorative/confetti shapes. No random symbols. No extra stickers.
3. No long paragraphs inside the image.
4. Only minimal text:
   - one short title
   - very short labels only
   - for math, short solution lines are allowed
5. If the question is:
   - "what is" / "what are" -> use template "definition"
   - "how" / "how does" / "process" -> use template "workflow"
   - "difference between" / "vs" / "compare" -> use template "comparison"
   - a direct arithmetic equation -> use template "math_steps"
   - a math concept like multiplication, division, fraction, area, perimeter, etc. -> use template "math_concept"
6. For comparison: use two clean columns.
7. For workflow: use 3 to 5 steps with arrows.
8. For math_steps:
   - IMPORTANT: Use VISUAL OBJECTS (apples, balls, stars) to show the math, NOT just numbers
   - For addition: show first group of objects + second group = combined group
   - For subtraction: show starting objects, cross out some, show remaining
   - For multiplication: show groups of objects
   - The child should be able to COUNT the objects to understand the answer
   - show the equation with objects, not just digits
9. For math_concept:
   - show the concept name simply
   - IMPORTANT: Use VISUAL OBJECTS to demonstrate the concept
   - For addition: show objects being combined
   - For subtraction: show objects being removed
   - make the example visual so a child can count and understand
10. Use 4 to 6 soft educational colors. Never make the image monochrome or black-and-white unless the topic truly requires it.
11. Never ask for a busy infographic.
12. Do not use too many icons. Only the icons that directly explain the question.

Return JSON ONLY in this exact schema:
{
  "template": "definition|workflow|comparison|math_steps|math_concept",
  "title": "SHORT TITLE",
  "icons": ["icon1", "icon2", "icon3"],
  "labels": ["label1", "label2", "label3"],
  "layout": "one short sentence",
  "arrows": true,
  "aspect_ratio": "1:1|4:3|16:9|3:4",
  "prompt": "complete final prompt for the image model"
}

Important:
- The prompt must clearly say where icons go, where arrows go, what labels are allowed, and that only relevant icons should appear.
- The prompt must explicitly say: no clutter, no decorations, no extra icons.
- For math concept questions, the image should explain the idea by solving one simple example.
- The JSON must be valid.
- Output JSON only.
"""


DEFAULT_NEGATIVE_TEXT = (
    "No clutter. No decoration. No confetti. No stickers. No random symbols. "
    "No busy infographic. No paragraphs. No long text. No dark background. "
    "No neon colors. No extra icons. Keep it simple, calm, and easy for a child to understand."
)


MATH_CONCEPT_KEYWORDS = [
    "addition",
    "subtraction",
    "multiplication",
    "division",
    "fraction",
    "fractions",
    "decimal",
    "decimals",
    "percentage",
    "percentages",
    "perimeter",
    "area",
    "volume",
    "ratio",
    "ratios",
    "algebra",
    "angle",
    "angles",
    "mean",
    "median",
    "mode",
    "average",
    "pemdas",
    "bodmas",
    "order of operations",
    "place value",
    "lcm",
    "hcf",
    "gcf",
    "multiple",
    "factor",
    "factors",
    "equation",
]


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract JSON object from model response."""
    cleaned = text.strip()

    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        return json.loads(match.group(0))

    raise json.JSONDecodeError("Could not extract valid JSON", cleaned, 0)


def _sanitize_list(items: Any, fallback: List[str], max_items: int = 6) -> List[str]:
    """Normalize icon/label lists."""
    if not isinstance(items, list):
        return fallback[:max_items]

    cleaned = []
    for item in items:
        text = str(item).strip()
        if text and text not in cleaned:
            cleaned.append(text)
        if len(cleaned) >= max_items:
            break

    return cleaned if cleaned else fallback[:max_items]


def _looks_like_math_expression(question: str) -> bool:
    """Check if question looks like a direct arithmetic expression."""
    q = question.strip().lower()

    if re.search(r"\d+\s*[-+x×*/÷]\s*\d+", q):
        return True

    simple_patterns = [
        r"what\s+is\s+\d+\s*[-+x×*/÷]\s*\d+",
        r"solve\s+\d+\s*[-+x×*/÷]\s*\d+",
    ]
    return any(re.search(pattern, q) for pattern in simple_patterns)


def _is_math_concept_question(question: str, subject: str) -> bool:
    """Check if question is asking about a math concept/theory."""
    q = question.lower().strip()
    subj = subject.lower().strip()

    if subj != "maths" and subj != "math":
        return False

    if _looks_like_math_expression(q):
        return False

    trigger_phrases = [
        "what is",
        "what are",
        "tell me about",
        "explain",
        "define",
        "difference between",
        "compare",
        "how do",
        "how does",
    ]

    has_trigger = any(phrase in q for phrase in trigger_phrases)
    has_math_keyword = any(keyword in q for keyword in MATH_CONCEPT_KEYWORDS)

    return has_trigger and has_math_keyword


def _extract_math_concept_name(question: str) -> str:
    """Best-effort extraction of the main math concept from the question."""
    q = question.lower()

    for keyword in MATH_CONCEPT_KEYWORDS:
        if keyword in q:
            return keyword.title()

    return "Math Concept"


def _math_concept_example_instruction(concept_name: str) -> str:
    """Return example instruction for a math concept."""
    concept = concept_name.lower()

    if "multiplication" in concept:
        return (
            "Show one simple solved example such as 3 × 2 = 6. "
            "Also show that multiplication means repeated addition: 2 + 2 + 2 = 6."
        )

    if "division" in concept:
        return (
            "Show one simple solved example such as 6 ÷ 2 = 3. "
            "Also show division as equal sharing into groups."
        )

    if "addition" in concept:
        return (
            "Show 2 + 3 = 5 using VISUAL OBJECTS: "
            "Draw 2 apples on the left, a plus sign, 3 apples on the right, equals sign, then 5 apples together. "
            "The child should be able to COUNT the objects to understand addition means combining groups."
        )

    if "subtraction" in concept:
        return (
            "Show 5 - 2 = 3 using VISUAL OBJECTS: "
            "Start with 5 balls, cross out 2 balls with a red X, show 3 balls remaining. "
            "The child should SEE objects being taken away to understand subtraction."
        )

    if "fraction" in concept:
        return (
            "Show one simple example such as 1/2 of a shape or 1/4 of a pizza. "
            "Make the parts clear and large."
        )

    if "decimal" in concept:
        return "Show one simple example such as 0.5 = one half."

    if "percentage" in concept:
        return "Show one simple example such as 50% = half."

    if "perimeter" in concept:
        return (
            "Show a simple rectangle with side lengths and add all sides to find perimeter."
        )

    if "area" in concept:
        return (
            "Show a simple rectangle with rows and columns or length × width."
        )

    if "angle" in concept:
        return "Show one simple angle example and label it clearly as an angle."

    if "average" in concept or "mean" in concept:
        return "Show a tiny example of adding a few numbers and dividing by how many numbers there are."

    if "pemdas" in concept or "bodmas" in concept or "order of operations" in concept:
        return "Show one simple equation and solve it in the correct order step by step."

    return "Show one simple solved example that explains the concept in an easy way."


def _heuristic_visual_plan(question: str, grade: int, subject: str) -> Dict[str, Any]:
    """Fallback visual plan when GPT prompt building fails."""
    q = question.strip()
    q_lower = q.lower()

    if _looks_like_math_expression(q):
        # Extract numbers from expression for visual representation
        numbers = re.findall(r'\d+', q)
        num1 = numbers[0] if len(numbers) > 0 else "2"
        num2 = numbers[1] if len(numbers) > 1 else "3"
        
        # Detect operation
        is_addition = "+" in q or "add" in q_lower or "plus" in q_lower
        is_subtraction = "-" in q or "subtract" in q_lower or "minus" in q_lower or "take away" in q_lower
        is_multiplication = "*" in q or "×" in q or "x" in q_lower or "multiply" in q_lower or "times" in q_lower
        is_division = "/" in q or "÷" in q or "divide" in q_lower
        
        # Calculate result for prompt
        try:
            n1, n2 = int(num1), int(num2)
            if is_addition:
                result = n1 + n2
                operation = "+"
                op_word = "plus"
            elif is_subtraction:
                result = n1 - n2
                operation = "-"
                op_word = "minus"
            elif is_multiplication:
                result = n1 * n2
                operation = "×"
                op_word = "times"
            elif is_division and n2 != 0:
                result = n1 // n2
                operation = "÷"
                op_word = "divided by"
            else:
                result = n1 + n2
                operation = "+"
                op_word = "plus"
        except:
            n1, n2, result = 2, 3, 5
            operation = "+"
            op_word = "plus"
        
        title = f"{n1} {operation} {n2} = {result}"
        icons = ["objects group 1", "operation sign", "objects group 2", "equals", "result group"]
        labels = [str(n1), operation, str(n2), "=", str(result)]
        layout = "Top row: first group + second group. Bottom row: result group."
        aspect_ratio = "1:1"  # Square format to prevent cropping
        
        # Each group in a SEPARATE ROW for easy counting
        if is_addition:
            prompt = (
                f"Simple math diagram for kids showing {n1} + {n2} = {result}. "
                f"Use small dots, circles, stars, or balls - any simple shape. "
                f"ROW 1: Show {n1} icons in a single horizontal row. Label '{n1}'. "
                f"ROW 2: Show {n2} icons in a single horizontal row. Label '{n2}'. "
                f"ROW 3: Show {result} icons in a single horizontal row. Label '{result}'. "
                f"Add a '+' between row 1 and 2, and '=' before row 3. "
                f"White background. Each row clearly separated. Easy to count each row. "
            )
        elif is_subtraction:
            prompt = (
                f"Simple math diagram for kids showing {n1} - {n2} = {result}. "
                f"Use small dots, circles, or balls. "
                f"ROW 1: Show {n1} icons in a row. Label 'Start: {n1}'. "
                f"ROW 2: Show {n2} icons crossed out. Label 'Take away: {n2}'. "
                f"ROW 3: Show {result} icons remaining. Label 'Left: {result}'. "
                f"White background. Each row clearly separated. "
            )
        elif is_multiplication:
            prompt = (
                f"Simple math diagram for kids showing {n1} × {n2} = {result}. "
                f"Show {n1} rows, each row has {n2} small dots or circles. "
                f"Total: {result} icons in a grid arrangement. "
                f"Label '{n1} × {n2} = {result}'. White background. "
            )
        else:
            prompt = (
                f"Simple math diagram for kids: {q}. "
                f"Use small dots or circles arranged in rows for easy counting. "
                f"Each group in its own row. Labels with numbers. White background. "
            )
        
        return {
            "template": "math_visual",
            "title": title,
            "icons": icons,
            "labels": labels,
            "layout": layout,
            "arrows": True,
            "aspect_ratio": aspect_ratio,
            "prompt": prompt,
            "math_info": {
                "n1": n1,
                "n2": n2,
                "result": result,
                "operation": operation
            }
        }

    if _is_math_concept_question(q, subject):
        concept_name = _extract_math_concept_name(q)
        title = concept_name
        icons = ["concept box", "example box", "result box"]
        labels = ["concept", "example", "result"]
        layout = "Top: concept title. Middle: one simple solved example. Bottom: short takeaway or result."
        aspect_ratio = "3:4"
        prompt = (
            f"Create a simple autism-friendly maths concept image about: {concept_name}. "
            f"The original student question is: {q}. "
            "White background, flat vector style, 4 to 6 soft educational colors, lots of empty space. "
            "Do not make it black-and-white. "
            "Top section: show the concept name clearly. "
            "Middle section: show one small solved example in large readable math text. "
            "Bottom section: show the final result or key idea clearly. "
            f"{_math_concept_example_instruction(concept_name)} "
            "Make the image basic, clear, and child-friendly. "
            "No decoration, no extra icons, no clutter, no busy infographic. "
            f"{DEFAULT_NEGATIVE_TEXT}"
        )
        return {
            "template": "math_concept",
            "title": title,
            "icons": icons,
            "labels": labels,
            "layout": layout,
            "arrows": True,
            "aspect_ratio": aspect_ratio,
            "prompt": prompt,
        }

    if "difference between" in q_lower or " vs " in q_lower or q_lower.startswith("compare"):
        title = "Compare"
        icons = ["left concept", "right concept", "column divider"]
        labels = ["left", "right"]
        layout = "Two clean columns with only relevant icons on each side."
        aspect_ratio = "16:9"
        prompt = (
            f"Create a simple autism-friendly comparison image for: {q}. "
            "White background, flat vector style, 4 to 6 soft educational colors, lots of spacing. "
            "Title at the top. Two clean columns. "
            "Use only 2 to 3 relevant icons on the left and 2 to 3 relevant icons on the right. "
            "Use very short labels only. No paragraphs. "
            "No decoration, no extra objects, no clutter. "
            f"{DEFAULT_NEGATIVE_TEXT}"
        )
        return {
            "template": "comparison",
            "title": title,
            "icons": icons,
            "labels": labels,
            "layout": layout,
            "arrows": False,
            "aspect_ratio": aspect_ratio,
            "prompt": prompt,
        }

    if q_lower.startswith("how") or "how does" in q_lower or "process" in q_lower or "work" in q_lower:
        title = q[:36].strip().rstrip("?")
        icons = ["step 1", "step 2", "step 3", "step 4"]
        labels = ["step 1", "step 2", "step 3", "step 4"]
        layout = "Short title at top. Below it, 3 to 5 simple steps connected by arrows."
        aspect_ratio = "16:9"
        prompt = (
            f"Create a simple autism-friendly workflow image for: {q}. "
            "White background, flat vector style, 4 to 6 soft educational colors, high contrast, lots of empty space. "
            "Use only the most relevant visual elements needed to explain the process. "
            "Show 3 to 5 large steps with clear arrows in order. "
            "Use tiny labels only. No paragraphs, no decoration, no clutter, no extra icons. "
            f"{DEFAULT_NEGATIVE_TEXT}"
        )
        return {
            "template": "workflow",
            "title": title,
            "icons": icons,
            "labels": labels,
            "layout": layout,
            "arrows": True,
            "aspect_ratio": aspect_ratio,
            "prompt": prompt,
        }

    title = q[:36].strip().rstrip("?") or subject.title()
    icons = ["main concept", "example 1", "example 2", "example 3"]
    labels = ["main", "example", "example", "example"]
    layout = "Title at top, then 3 to 5 large relevant icons in one simple row or grid."
    aspect_ratio = "4:3"
    prompt = (
        f"Create a simple autism-friendly educational image for: {q}. "
        f"Subject: {subject}. Grade: {grade}. "
        "White background, flat vector style, calm colorful icons, lots of spacing. "
        "Use only relevant icons that directly explain the topic. "
        "Use very short labels only. No decoration, no confetti, no extra symbols, no clutter, no long text. "
        f"{DEFAULT_NEGATIVE_TEXT}"
    )
    return {
        "template": "definition",
        "title": title,
        "icons": icons,
        "labels": labels,
        "layout": layout,
        "arrows": False,
        "aspect_ratio": aspect_ratio,
        "prompt": prompt,
    }


def _build_final_image_prompt(plan: Dict[str, Any], question: str, grade: int, subject: str) -> str:
    """Build the final strict prompt for the image model."""
    title = plan["title"]
    icons = plan["icons"]
    labels = plan["labels"]
    icon_count = len(icons)

    icon_text = ", ".join(icons[:icon_count])
    label_text = ", ".join(labels[:icon_count])

    base = [
        f"Create a simple autism-friendly educational image for Grade {grade} {subject} students about: {question}.",
        "Style: flat vector, white background, 4 to 6 soft educational colors, high contrast, lots of empty space.",
        "Do not make it monochrome or black-and-white.",
        f"Use EXACTLY {icon_count} relevant visual elements only: {icon_text}.",
        f"Allowed labels only: {label_text}.",
        f"Title: {title}.",
        f"Layout: {plan['layout']}",
        "No decoration, no confetti, no extra icons, no random symbols, no busy infographic style.",
        "Keep everything clean, basic, calm, and easy for a child to understand.",
    ]

    template = plan["template"]

    if template == "comparison":
        base.append(
            "Use two clean columns. Left side explains the first concept. Right side explains the second concept."
        )

    elif template == "workflow":
        base.append(
            "Connect the steps with clear arrows in the correct order."
        )

    elif template == "math_steps":
        base.append(
            "Show the full equation clearly at the top, then show 2 to 3 simple solution steps in order, then show the final answer clearly at the bottom. "
            "Use large readable math text and symbols. "
            "A few supporting blocks or shapes are allowed, but the written solution steps are more important."
        )

    elif template == "math_concept":
        base.append(
            "Explain the maths idea using one simple solved example. "
            "Top: concept title. Middle: easy example solved clearly. Bottom: short key idea or result. "
            "Use readable math text and symbols. The solved example is more important than decorative visuals."
        )

    else:
        base.append(
            "Arrange the icons in one simple row or grid so the student can understand the topic at a glance."
        )

    base.append(DEFAULT_NEGATIVE_TEXT)

    return " ".join(base)


def _normalize_visual_plan(plan: Dict[str, Any], question: str, grade: int, subject: str) -> Dict[str, Any]:
    """Validate and normalize a visual plan."""
    fallback = _heuristic_visual_plan(question, grade, subject)

    template = str(plan.get("template", fallback["template"])).strip().lower()
    if template not in {"definition", "workflow", "comparison", "math_steps", "math_concept"}:
        template = fallback["template"]

    title = str(plan.get("title", fallback["title"])).strip() or fallback["title"]

    aspect_ratio = str(plan.get("aspect_ratio", fallback["aspect_ratio"])).strip()
    if aspect_ratio not in {"1:1", "4:3", "16:9", "3:4"}:
        aspect_ratio = fallback["aspect_ratio"]

    icons = _sanitize_list(plan.get("icons"), fallback["icons"])
    labels = _sanitize_list(plan.get("labels"), fallback["labels"], max_items=len(icons))
    if len(labels) < len(icons):
        labels += [icon[:18] for icon in icons[len(labels):]]

    layout = str(plan.get("layout", fallback["layout"])).strip() or fallback["layout"]
    arrows = bool(plan.get("arrows", fallback["arrows"]))

    prompt = str(plan.get("prompt", "")).strip()
    if not prompt:
        prompt = _build_final_image_prompt(
            {
                "template": template,
                "title": title,
                "icons": icons,
                "labels": labels,
                "layout": layout,
                "arrows": arrows,
                "aspect_ratio": aspect_ratio,
            },
            question=question,
            grade=grade,
            subject=subject,
        )

    return {
        "template": template,
        "title": title,
        "icons": icons,
        "labels": labels,
        "layout": layout,
        "arrows": arrows,
        "aspect_ratio": aspect_ratio,
        "prompt": prompt,
    }


def enhance_image_prompt(question: str, grade: int, subject: str) -> Dict[str, Any]:
    """Use GPT-4o-mini to create a strict visual plan."""
    client = get_openai_client()
    if not client:
        fallback = _heuristic_visual_plan(question, grade, subject)
        return _normalize_visual_plan(fallback, question, grade, subject)

    user_prompt = (
        f"Question: {question}\n"
        f"Grade: {grade}\n"
        f"Subject: {subject}\n\n"
        "Build the image plan now."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": IMAGE_BUILDER_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=900,
            response_format={"type": "json_object"},
        )

        response_text = response.choices[0].message.content.strip()
        prompt_data = _extract_json(response_text)
        plan = _normalize_visual_plan(prompt_data, question, grade, subject)

        print(f"Visual prompt template: {plan['template']}")
        print(f"Visual prompt icons: {plan['icons']}")
        print(f"Visual prompt title: {plan['title']}")
        return plan

    except Exception as e:
        print(f"Error enhancing prompt: {e}")
        fallback = _heuristic_visual_plan(question, grade, subject)
        return _normalize_visual_plan(fallback, question, grade, subject)


# =========================================================
# IMAGE GENERATION
# =========================================================
def _aspect_ratio_to_size(aspect_ratio: str) -> str:
    """Map aspect ratio to supported image sizes."""
    if aspect_ratio == "16:9":
        return "1536x1024"
    if aspect_ratio == "3:4":
        return "1024x1536"
    if aspect_ratio == "4:3":
        return "1536x1024"
    return "1024x1024"


def _save_b64_image_to_temp(b64_string: str) -> Optional[str]:
    """Save base64 image to a temporary local file and return file path."""
    try:
        image_bytes = base64.b64decode(b64_string)
        temp_dir = os.path.join(os.getcwd(), "temp_generated_images")
        os.makedirs(temp_dir, exist_ok=True)

        file_name = f"generated_{uuid.uuid4().hex}.png"
        file_path = os.path.join(temp_dir, file_name)

        with open(file_path, "wb") as f:
            f.write(image_bytes)

        return file_path
    except Exception as e:
        print(f"Error saving base64 image: {e}")
        return None


def _verify_math_image(client, image_url: str, expected_n1: int, expected_n2: int, expected_result: int, operation: str) -> Dict[str, Any]:
    """
    Verify a math image using GPT-4 Vision to check if object counts are correct.
    
    Returns:
        Dict with 'is_correct', 'actual_counts', 'feedback'
    """
    try:
        op_name = "addition" if operation == "+" else "subtraction" if operation == "-" else "multiplication" if operation in ["×", "*"] else "division"
        
        verify_prompt = f"""You are verifying a math educational image for children.

The image should show the equation: {expected_n1} {operation} {expected_n2} = {expected_result}
Layout should be LEFT TO RIGHT: first group, operator, second group, equals, result.

Please check:
1. How many objects are in the LEFTMOST group?
2. How many objects are in the MIDDLE group (before equals sign)?
3. How many objects are in the RIGHTMOST group (after equals sign - this should be the RESULT)?
4. Is the layout correct? (first number, then operator, then second number, then equals, then result)

Respond in this exact JSON format:
{{
    "first_group_count": <number on far left>,
    "second_group_count": <number in middle>,
    "result_count": <number on far right after equals>,
    "layout_correct": true/false,
    "is_correct": true/false,
    "feedback": "explanation if incorrect"
}}

CRITICAL: The RESULT ({expected_result} objects) must be on the FAR RIGHT, not in the middle!"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": verify_prompt},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            max_tokens=500
        )
        
        result_text = response.choices[0].message.content
        
        # Extract JSON from response
        try:
            # Try to parse JSON
            import json
            json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if json_match:
                verification = json.loads(json_match.group(0))
                
                # Double check the math and layout
                first = verification.get("first_group_count", 0)
                second = verification.get("second_group_count", 0)
                result = verification.get("result_count", 0)
                layout_ok = verification.get("layout_correct", True)
                
                # Verify counts match expected AND layout is correct
                counts_correct = (
                    first == expected_n1 and 
                    second == expected_n2 and 
                    result == expected_result
                )
                
                is_correct = counts_correct and layout_ok
                
                verification["is_correct"] = is_correct
                if not is_correct:
                    if not layout_ok:
                        verification["feedback"] = f"Layout wrong! Result should be on far right. Found: {first}, {second}, {result} from left to right."
                    else:
                        verification["feedback"] = f"Counts wrong! Expected: {expected_n1} {operation} {expected_n2} = {expected_result}. Found: {first} + {second} = {result}."
                
                return verification
        except Exception as e:
            print(f"Error parsing verification JSON: {e}")
        
        return {"is_correct": False, "feedback": "Could not verify image"}
        
    except Exception as e:
        print(f"Image verification error: {e}")
        return {"is_correct": True, "feedback": "Verification skipped"}  # Don't block on errors


def _generate_single_image(client, image_prompt: str, size: str) -> Optional[str]:
    """Generate a single image and return URL or path."""
    # Try GPT Image 1.5
    try:
        response = client.images.generate(
            model="gpt-image-1.5",
            prompt=image_prompt,
            size=size,
            quality="high",
            n=1,
        )
        if response.data and len(response.data) > 0:
            first_item = response.data[0]
            if getattr(first_item, "b64_json", None):
                saved_path = _save_b64_image_to_temp(first_item.b64_json)
                if saved_path:
                    return saved_path
            if getattr(first_item, "url", None):
                return first_item.url
    except Exception as e:
        print(f"GPT Image 1.5 error: {e}")

    # Try GPT Image 1
    try:
        response = client.images.generate(
            model="gpt-image-1",
            prompt=image_prompt,
            size=size,
            quality="high",
            n=1,
        )
        if response.data and len(response.data) > 0:
            first_item = response.data[0]
            if getattr(first_item, "b64_json", None):
                saved_path = _save_b64_image_to_temp(first_item.b64_json)
                if saved_path:
                    return saved_path
            if getattr(first_item, "url", None):
                return first_item.url
    except Exception as e:
        print(f"GPT Image 1 error: {e}")

    # Try DALL-E 3
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=image_prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        if response.data and len(response.data) > 0:
            first_item = response.data[0]
            if getattr(first_item, "url", None):
                return first_item.url
            if getattr(first_item, "b64_json", None):
                saved_path = _save_b64_image_to_temp(first_item.b64_json)
                if saved_path:
                    return saved_path
    except Exception as e:
        print(f"DALL-E 3 error: {e}")

    return None


def generate_image_from_prompt(
    image_prompt: str,
    aspect_ratio: str = "1:1",
    math_info: Optional[Dict[str, Any]] = None,
    max_attempts: int = 3,
) -> Optional[str]:
    """Render a pre-built DALL·E prompt — *no* GPT prompt-rewriting.

    Used by the visual_aids router for the "countable arithmetic" track,
    where we want a deterministic, locked-down prompt (so DALL·E can't
    invent extra apples). If `math_info` is supplied, GPT-Vision verifies
    the rendered counts and we retry up to `max_attempts` times with a
    tighter row-by-row prompt if the counts are wrong.
    """
    client = get_openai_client()
    if not client:
        print("OpenAI client not found")
        return None

    size = _aspect_ratio_to_size(aspect_ratio)
    is_math_image = math_info is not None
    attempts = max(1, max_attempts if is_math_image else 1)
    current_prompt = image_prompt

    for attempt in range(attempts):
        print(f"[image] direct-prompt attempt {attempt + 1}/{attempts}")
        image_result = _generate_single_image(client, current_prompt, size)
        if not image_result:
            continue

        if is_math_image and attempt < attempts - 1:
            n1, n2 = math_info["n1"], math_info["n2"]
            expected = math_info["result"]
            operation = math_info["operation"]

            verify_url = image_result
            if image_result.startswith("/") or (len(image_result) > 2 and image_result[1] == ":"):
                try:
                    with open(image_result, "rb") as f:
                        verify_url = f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
                except Exception as err:
                    print(f"[image] could not read for verification: {err}")
                    return image_result

            verification = _verify_math_image(client, verify_url, n1, n2, expected, operation)
            if verification.get("is_correct", False):
                print("[OK] Countable image verification PASSED")
                return image_result

            print(f"[FAIL] Countable image miscount, retrying: {verification.get('feedback', '')}")
            current_prompt = (
                f"Math diagram for kids: {n1} {operation} {n2} = {expected}. "
                f"THREE clearly separated horizontal rows on a white background. "
                f"Row 1: exactly {n1} identical small simple shapes (dots or circles). "
                f"Row 2: exactly {n2} identical small simple shapes. "
                f"Row 3: exactly {expected} identical small simple shapes. "
                f"Label each row with its number. Add '+' or '-' or '×' between rows 1 and 2, "
                f"and '=' between rows 2 and 3. Counts must be EXACT — no extras, no missing."
            )
            continue

        return image_result

    print("[image] all attempts failed")
    return None


def generate_image(
    question: str, 
    grade: int, 
    subject: str,
    chat_history: List[Dict] = None
) -> Optional[str]:
    """Generate an educational image using OpenAI image generation with verification for math."""
    client = get_openai_client()
    if not client:
        print("OpenAI client not found")
        return None

    # Get full context for image generation (handles follow-up questions)
    image_question = get_image_context(question, chat_history or [], subject)
    
    print(f"Building image prompt for: {image_question[:100]}...")
    prompt_data = enhance_image_prompt(image_question, grade, subject)

    image_prompt = prompt_data.get("prompt", "")
    aspect_ratio = prompt_data.get("aspect_ratio", "4:3")
    template = prompt_data.get("template", "definition")
    size = _aspect_ratio_to_size(aspect_ratio)
    
    # Extract math info for verification
    math_info = prompt_data.get("math_info", None)

    print(f"Image template: {template}")
    print(f"Aspect ratio: {aspect_ratio}")
    print(f"OpenAI image size: {size}")
    print(f"Generated image prompt: {image_prompt[:300]}...")

    # For math images, use verification and retry if incorrect
    is_math_image = template == "math_visual" and math_info is not None
    max_attempts = 3 if is_math_image else 1
    
    for attempt in range(max_attempts):
        print(f"Image generation attempt {attempt + 1}/{max_attempts}")
        
        # Generate the image
        image_result = _generate_single_image(client, image_prompt, size)
        
        if not image_result:
            print("Image generation failed")
            continue
        
        # For math images, verify the object counts
        if is_math_image and attempt < max_attempts - 1:
            n1 = math_info["n1"]
            n2 = math_info["n2"]
            expected_result = math_info["result"]
            operation = math_info["operation"]
            
            print(f"Verifying math image: {n1} {operation} {n2} = {expected_result}")
            
            # Convert local path to data URI for verification if needed
            verify_url = image_result
            if image_result.startswith("/") or (len(image_result) > 2 and image_result[1] == ":"):
                # It's a local file path, convert to data URI
                try:
                    with open(image_result, "rb") as f:
                        img_data = base64.b64encode(f.read()).decode("utf-8")
                        verify_url = f"data:image/png;base64,{img_data}"
                except Exception as e:
                    print(f"Error reading image for verification: {e}")
                    return image_result  # Return without verification
            
            verification = _verify_math_image(client, verify_url, n1, n2, expected_result, operation)
            
            if verification.get("is_correct", False):
                print("✅ Math image verification PASSED!")
                return image_result
            else:
                print(f"❌ Math image verification FAILED: {verification.get('feedback', 'Unknown error')}")
                
                # Retry with row-based layout
                image_prompt = (
                    f"Math diagram: {n1} {operation} {n2} = {expected_result}. "
                    f"THREE SEPARATE ROWS: "
                    f"Row 1: {n1} small dots in a line. "
                    f"Row 2: {n2} small dots in a line. "
                    f"Row 3: {expected_result} small dots in a line. "
                    f"Each row clearly separated. Numbers labeled. White background. "
                )
                print(f"Retrying with more explicit prompt...")
                continue
        
        # Not a math image or final attempt - return the result
        return image_result
    
    print("All image generation attempts failed.")
    return None


# =========================================================
# TEXT-TO-SPEECH (TTS) using OpenAI
# =========================================================
def generate_speech(text: str, language: str = "en") -> Optional[bytes]:
    """
    Generate speech audio from text using OpenAI TTS model.
    
    Args:
        text: The text to convert to speech
        language: Language code ("en" for English, "ur" for Urdu)
    
    Returns:
        Audio bytes (MP3 format) or None if failed
    """
    client = get_openai_client()
    if not client:
        print("OpenAI client not available for TTS")
        return None
    
    try:
        # Use alloy voice for English, nova for Urdu (both work well)
        # Available voices: alloy, echo, fable, onyx, nova, shimmer
        voice = "nova" if language == "ur" else "alloy"
        
        # Truncate text if too long (TTS has limits)
        max_chars = 4000
        if len(text) > max_chars:
            text = text[:max_chars] + "..."
        
        response = client.audio.speech.create(
            model="tts-1",  # or "tts-1-hd" for higher quality
            voice=voice,
            input=text,
            response_format="mp3"
        )
        
        # Get audio bytes
        audio_bytes = response.content
        print(f"TTS generated: {len(audio_bytes)} bytes")
        return audio_bytes
        
    except Exception as e:
        print(f"TTS generation error: {e}")
        return None


def text_to_speech_base64(text: str, language: str = "en") -> Optional[str]:
    """
    Generate speech and return as base64-encoded string for HTML audio playback.
    
    Args:
        text: The text to convert to speech
        language: Language code ("en" for English, "ur" for Urdu)
    
    Returns:
        Base64-encoded audio string or None if failed
    """
    audio_bytes = generate_speech(text, language)
    if audio_bytes:
        return base64.b64encode(audio_bytes).decode("utf-8")
    return None


# =========================================================
# COMBINED RESPONSE WITH AUTO-IMAGE
# =========================================================
def generate_response_with_auto_image(
    user_message: str,
    grade: int,
    subject: str,
    chat_history: List[Dict],
    use_rag: bool = True,
    language: str = None,
) -> Dict[str, Any]:
    """
    Generate a text response and automatically generate an image
    if the question is a "how" question or would benefit from visuals.
    
    Returns:
        Dict with keys:
        - text_response: The text answer
        - image_url: URL/path to generated image (or None)
        - auto_image_generated: Whether image was auto-generated
    """
    # Generate text response first
    text_response = generate_response(
        user_message, grade, subject, chat_history, use_rag, language
    )
    
    result = {
        "text_response": text_response,
        "image_url": None,
        "auto_image_generated": False
    }
    
    # Check if we should auto-generate an image
    if should_auto_generate_image(user_message, subject, chat_history):
        print(f"Auto-generating image for: {user_message[:50]}...")
        try:
            image_url = generate_image(user_message, grade, subject, chat_history)
            if image_url:
                result["image_url"] = image_url
                result["auto_image_generated"] = True
                print("Auto-image generated successfully!")
        except Exception as e:
            print(f"Auto-image generation failed: {e}")
    
    return result


# =========================================================
# QUIZ GENERATION
# =========================================================
def generate_quiz_question(
    grade: int,
    subject: str,
    topic: Optional[str] = None
) -> Dict:
    """Generate a quiz question for practice."""

    client = get_openai_client()
    if not client:
        return None

    prompt = f"""Generate a simple multiple-choice quiz question for a Grade {grade} student studying {subject}.
{"Topic: " + topic if topic else ""}

Format your response as:
Question: [Your question here]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct: [A/B/C/D]
Explanation: [Brief, encouraging explanation]
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a friendly quiz master for students with autism. Keep questions simple and clear.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=500,
        )

        content = response.choices[0].message.content
        return {"raw": content}

    except Exception:
        return None
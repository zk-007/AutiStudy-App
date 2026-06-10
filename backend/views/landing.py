
import streamlit as st
from pathlib import Path
import base64
import mimetypes
from utils.language import t, get_language, set_language, is_urdu


# -----------------------------
# Helpers
# -----------------------------
def _get_asset_path():
    return Path("assets")


def _first_existing(paths):
    for p in paths:
        try:
            if p and Path(p).exists():
                return str(p)
        except Exception:
            pass
    return None


def _img_to_data_uri(path: str) -> str:
    p = Path(path)
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    data = base64.b64encode(p.read_bytes()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def _safe_navigate(target: str):
    nav_fn = st.session_state.get("navigate", None)
    if callable(nav_fn):
        nav_fn(target)
        return

    st.session_state["page"] = target
    try:
        st.rerun()
    except Exception:
        pass


def _inject_css():
    st.markdown(
        """
        <style>
        .stApp {
            background: linear-gradient(135deg, #EAF2FF 0%, #F4F8FF 45%, #EDEBFF 100%);
        }

        section.main > div.block-container {
            max-width: 1180px;
            padding-top: 1.4rem;
            padding-bottom: 2.8rem;
            background: rgba(255,255,255,0.55);
            border: 1px solid rgba(148,163,184,0.18);
            border-radius: 22px;
            box-shadow: 0 12px 35px rgba(15,23,42,0.07);
            backdrop-filter: blur(10px);
        }

        .block-container {
            padding-left: 2rem;
            padding-right: 2rem;
        }

        footer, #MainMenu {
            visibility: hidden;
        }

        div[data-testid="stHorizontalBlock"],
        div[data-testid="column"] {
            overflow: visible;
        }

        div[data-testid="stHorizontalBlock"] {
            align-items: center !important;
        }

        /* ---------- Brand ---------- */
        .brand {
            font-size: 2.35rem;
            font-weight: 900;
            letter-spacing: -0.02em;
            color: #2563EB;
            margin: 0;
            line-height: 1;
            white-space: nowrap;
        }

        .brand-ltr {
            direction: ltr;
            text-align: left;
        }

        .brand-rtl {
            direction: rtl;
            text-align: right;
        }

        /* ---------- Nav buttons ---------- */
        [data-testid="stButton"][class*="st-key-lang_en"] button,
        [data-testid="stButton"][class*="st-key-lang_ur"] button,
        [data-testid="stButton"][class*="st-key-nav_about"] button,
        [data-testid="stButton"][class*="st-key-nav_faq"] button {
            width: 100% !important;
            height: 52px !important;
            min-height: 52px !important;
            padding: 0 1rem !important;
            margin: 0 !important;
            border-radius: 999px !important;
            font-weight: 800 !important;
            font-size: 1rem !important;
            color: #ffffff !important;
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 70%, #1E40AF 100%) !important;
            box-shadow: 0 8px 20px rgba(37,99,235,0.18) !important;
            border: 1px solid rgba(37,99,235,0.22) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            white-space: nowrap !important;
        }

        [data-testid="stButton"][class*="st-key-lang_en"] button *,
        [data-testid="stButton"][class*="st-key-lang_ur"] button *,
        [data-testid="stButton"][class*="st-key-nav_about"] button *,
        [data-testid="stButton"][class*="st-key-nav_faq"] button * {
            color: #ffffff !important;
        }

        [data-testid="stButton"][class*="st-key-lang_en"] button:hover,
        [data-testid="stButton"][class*="st-key-lang_ur"] button:hover,
        [data-testid="stButton"][class*="st-key-nav_about"] button:hover,
        [data-testid="stButton"][class*="st-key-nav_faq"] button:hover {
            transform: translateY(-1px);
            box-shadow: 0 10px 24px rgba(37,99,235,0.24) !important;
        }

        /* ---------- Hero ---------- */
        .hero-text {
            padding: 0.5rem 0;
        }

        .hero-text-ltr {
            text-align: left;
            direction: ltr;
        }

        .hero-text-rtl {
            text-align: right;
            direction: rtl;
        }

        .hero-title {
            color: #0F2D4A;
            font-size: 3rem;
            font-weight: 900;
            letter-spacing: -0.02em;
            line-height: 1.12;
            margin: 0 0 0.9rem 0;
        }

        .hero-sub {
            color: #475569;
            font-size: 1.35rem;
            font-weight: 500;
            line-height: 1.5;
            margin: 0 0 1.35rem 0;
        }

        .hero-img-wrap-left,
        .hero-img-wrap-right {
            display: flex;
            align-items: flex-start;
            padding-top: 0.2rem;
        }

        .hero-img-wrap-left {
            justify-content: flex-start;
        }

        .hero-img-wrap-right {
            justify-content: flex-end;
        }

        .hero-img {
            height: 340px;
            width: auto;
            max-width: 100%;
            display: block;
        }

        /* ---------- CTA ---------- */
        [data-testid="stButton"][class*="st-key-hero_start"] button {
            width: 100% !important;
            min-width: 200px !important;
            height: 60px !important;
            min-height: 60px !important;
            padding: 0 1.6rem !important;
            border-radius: 999px !important;
            font-size: 1.15rem !important;
            font-weight: 900 !important;
            color: #ffffff !important;
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 60%, #1E40AF 100%) !important;
            box-shadow: 0 12px 28px rgba(37,99,235,0.22) !important;
            border: 1px solid rgba(37,99,235,0.22) !important;
        }

        [data-testid="stButton"][class*="st-key-hero_start"] button * {
            color: #ffffff !important;
        }

        /* ---------- Features ---------- */
        .feat-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1.1rem;
            margin-top: 1.2rem;
            margin-bottom: 0.55rem;
        }

        .feat-card {
            background: rgba(255,255,255,0.72);
            border: 1px solid rgba(148,163,184,0.22);
            border-radius: 18px;
            padding: 1.35rem 1.25rem;
            box-shadow: 0 10px 28px rgba(15,23,42,0.06);
            transition: transform .15s ease, box-shadow .15s ease;
            text-align: center;
            min-height: 175px;
        }

        .feat-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 16px 40px rgba(15,23,42,0.09);
        }

        .feat-ico {
            font-size: 3.2rem;
            margin-bottom: 0.6rem;
        }

        .feat-title {
            font-size: 1.25rem;
            font-weight: 900;
            color: #0F2D4A;
            margin: 0 0 0.35rem 0;
        }

        .feat-desc {
            font-size: 1.05rem;
            font-weight: 500;
            color: #64748B;
            margin: 0;
        }

        .rtl-text {
            direction: rtl;
            text-align: right;
        }

        .ltr-text {
            direction: ltr;
            text-align: left;
        }

        /* ---------- How it works ---------- */
        .how-title {
            text-align: center;
            color: #0F2D4A;
            font-size: 2.05rem;
            font-weight: 900;
            margin: 2.3rem 0 1.2rem 0;
        }

        .how-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.1rem;
            flex-wrap: wrap;
            margin-top: 0.4rem;
        }

        .how-step {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            padding: 1.05rem 1.25rem;
            border-radius: 16px;
            background: rgba(239,246,255,0.85);
            border: 1px solid rgba(37,99,235,0.18);
        }

        .how-ico {
            font-size: 2.65rem;
            line-height: 1;
        }

        .how-text {
            font-size: 1.22rem;
            font-weight: 900;
            color: #0F2D4A;
            margin: 0;
        }

        .how-arrow {
            font-size: 2.05rem;
            font-weight: 900;
            color: #2563EB;
            opacity: 0.9;
        }

        /* ---------- Footer ---------- */
        .foot-wrap {
            margin-top: 2.6rem;
            padding-top: 1.6rem;
            border-top: 1px solid rgba(148,163,184,0.30);
            text-align: center;
        }

        .foot-sub {
            margin-top: 0.7rem;
            color: #64748B;
            font-size: 1.03rem;
            font-weight: 600;
        }

        /* ---------- Responsive ---------- */
        @media (max-width: 1050px) {
            .feat-grid { grid-template-columns: repeat(2, 1fr); }
            .hero-title { font-size: 2.45rem; }
            .hero-sub { font-size: 1.2rem; }
            .hero-img { height: 290px; }
            .brand { font-size: 2.05rem; }
        }

        @media (max-width: 700px) {
            section.main > div.block-container {
                padding-left: 1rem;
                padding-right: 1rem;
            }

            .feat-grid { grid-template-columns: 1fr; }
            .hero-img { height: 240px; }
            .brand { font-size: 1.85rem; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


# -----------------------------
# Main render
# -----------------------------
def render_landing():
    _inject_css()

    urdu = is_urdu()
    brand_class = "brand-rtl" if urdu else "brand-ltr"
    text_class = "hero-text-rtl" if urdu else "hero-text-ltr"
    feature_text_class = "rtl-text" if urdu else "ltr-text"

    # ---------- Header ----------
    if urdu:
        col_faq, col_about, col_lang_ur, col_lang_en, col_gap, col_brand = st.columns(
            [1, 1, 1, 1, 0.25, 2.35], gap="small"
        )
    else:
        col_brand, col_gap, col_lang_en, col_lang_ur, col_about, col_faq = st.columns(
            [2.35, 0.25, 1, 1, 1, 1], gap="small"
        )

    with col_brand:
        st.markdown(f'<div class="brand {brand_class}">{t("brand")}</div>', unsafe_allow_html=True)

    with col_lang_en:
        btn_type = "primary" if get_language() == "en" else "secondary"
        if st.button("English", key="lang_en", use_container_width=True, type=btn_type):
            set_language("en")
            st.rerun()

    with col_lang_ur:
        btn_type = "primary" if get_language() == "ur" else "secondary"
        if st.button("اردو", key="lang_ur", use_container_width=True, type=btn_type):
            set_language("ur")
            st.rerun()

    with col_about:
        if st.button(t("about"), key="nav_about", use_container_width=True):
            _safe_navigate("about")

    with col_faq:
        if st.button(t("faq"), key="nav_faq", use_container_width=True):
            _safe_navigate("faq")

    st.markdown(
        '<hr style="border:none;border-top:1px solid rgba(148,163,184,0.25);margin:0.7rem 0 1.4rem 0;">',
        unsafe_allow_html=True,
    )

    # ---------- Hero ----------
    if urdu:
        img_col, text_col = st.columns([1.1, 1.25], gap="large")
    else:
        text_col, img_col = st.columns([1.25, 1.1], gap="large")

    assets = _get_asset_path()
    hero_candidates = [
        assets / "hero.png",
        assets / "hero.jpg",
        assets / "hero.jpeg",
        assets / "hero.webp",
        Path("landing page.jpg"),
        Path("landing_page.jpg"),
    ]
    hero_path = _first_existing(hero_candidates)

    with text_col:
        st.markdown(
            f"""
            <div class="hero-text {text_class}">
                <div class="hero-title">{t("adaptive_tutor")}</div>
                <div class="hero-sub">{t("hero_subtitle")}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if urdu:
            cta_space, cta_col = st.columns([2, 1])
        else:
            cta_col, cta_space = st.columns([1, 2])

        with cta_col:
            if st.button(f"🚀 {t('get_started')}", key="hero_start", type="primary", use_container_width=True):
                _safe_navigate("signup")

    with img_col:
        if hero_path:
            uri = _img_to_data_uri(hero_path)
            wrap_class = "hero-img-wrap-left" if urdu else "hero-img-wrap-right"
            st.markdown(
                f"""
                <div class="{wrap_class}">
                    <img class="hero-img" src="{uri}" alt="AutiStudy Hero" />
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            align = "left" if urdu else "right"
            st.markdown(
                f"""
                <div style="text-align:{align}; padding: 1rem 0;">
                    <div style="font-size: 7rem; line-height: 1;">👩‍🎓🤖</div>
                    <div style="margin-top: 0.6rem; color:#64748B; font-size:1.15rem; font-weight:800;">
                        AI-Powered Learning for Every Student
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    # ---------- Features ----------
    st.markdown(
        f"""
        <div class="feat-grid">
          <div class="feat-card">
            <div class="feat-ico">🤖</div>
            <div class="feat-title {feature_text_class}">{t("ai_tutor")}</div>
            <p class="feat-desc {feature_text_class}">{t("ai_tutor_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">📚</div>
            <div class="feat-title {feature_text_class}">{t("multimodal")}</div>
            <p class="feat-desc {feature_text_class}">{t("multimodal_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">🎯</div>
            <div class="feat-title {feature_text_class}">{t("personalized")}</div>
            <p class="feat-desc {feature_text_class}">{t("personalized_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">🏆</div>
            <div class="feat-title {feature_text_class}">{t("your_progress")}</div>
            <p class="feat-desc {feature_text_class}">{t("stars_earned")}</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ---------- How it works ----------
    st.markdown(
        f'<div class="how-title {"rtl-text" if urdu else ""}">{t("how_it_works")}</div>',
        unsafe_allow_html=True,
    )

    arrow = "←" if urdu else "→"
    st.markdown(
        f"""
        <div class="how-row">
          <div class="how-step"><div class="how-ico">📝</div><div class="how-text {'rtl-text' if urdu else ''}">{t("step1")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">💬</div><div class="how-text {'rtl-text' if urdu else ''}">{t("step2")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">📖</div><div class="how-text {'rtl-text' if urdu else ''}">{t("step3")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">📊</div><div class="how-text {'rtl-text' if urdu else ''}">{t("step4")}</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ---------- Footer ----------
    st.markdown(
        """
        <div class="foot-wrap">
          <div class="foot-sub">© 2024 AutiStudy. Made with ❤️ for students in Pakistan</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

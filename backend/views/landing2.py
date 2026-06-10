import streamlit as st
from pathlib import Path
import base64
import mimetypes
from utils.language import t, get_language, set_language, is_urdu, get_direction


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
    """
    Uses your existing navigation if present (st.session_state.navigate),
    otherwise falls back to st.session_state["page"] = target.
    """
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
        /* Background gradient */
        .stApp {
            background: linear-gradient(135deg, #EAF2FF 0%, #F4F8FF 45%, #EDEBFF 100%);
        }

        /* Main container */
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

        .block-container { padding-left: 2.0rem; padding-right: 2.0rem; }

        footer {visibility: hidden;}
        #MainMenu {visibility: hidden;}

        /* Allow gentle overlaps between columns (for hero image overlay effect) */
        div[data-testid="stHorizontalBlock"],
        div[data-testid="column"]{
            overflow: visible;
        }

        /* NAV */
        .nav-wrap{
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:1rem;
            padding: 0.2rem 0.2rem 0.9rem 0.2rem;
        }

        /* ✅ Slightly smaller brand (AutiStudy) */
        .brand{
            font-size: 2.18rem;   /* was 2.35rem */
            font-weight: 900;
            letter-spacing: -0.02em;
            color: #2563EB;
            margin: 0;
            line-height: 1;
        }

        .nav-actions{
            display:flex;
            gap: 1.10rem;
            align-items:center;
            justify-content:flex-end;
            margin-right: 0.35rem;
        }
        
        /* Ensure all nav button columns are vertically aligned */
        [data-testid="stHorizontalBlock"] {
            align-items: center !important;
        }
        
        [data-testid="stHorizontalBlock"] > [data-testid="column"] {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        
        [data-testid="stHorizontalBlock"] > [data-testid="column"] > div {
            width: 100% !important;
        }

        /* Hero layering (lets the image overlap the Get Started button slightly) */
        .hero-left{ position: relative; z-index: 1; }
        .hero-right{ position: relative; z-index: 10; }
        .hero-img{
            height: 360px;          /* was 320px */
            width: auto;
            max-width: 115%;        /* lets it grow a bit */
            transform: translateX(-26px) translateY(14px);
            position: relative;
            z-index: 10;
            pointer-events: none;
        }
	

        /* Header buttons: same size, blue, white text */
        .nav-btn{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width: 140px;
            height: 52px;
            padding: 0 1.25rem;
            border-radius: 999px;
            font-weight: 900;
            font-size: 1.08rem;
            text-decoration:none !important;
            color: #ffffff !important;
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 70%, #1E40AF 100%);
            box-shadow: 0 10px 25px rgba(37,99,235,0.18);
            border: 1px solid rgba(37,99,235,0.22);
        }
        .nav-btn:visited{ color:#ffffff !important; }
        .nav-btn:hover{
            filter: brightness(0.98);
            transform: translateY(-1px);
        }
        
        /* Style ALL Streamlit buttons consistently - both primary and secondary */
        .stButton {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
        }
        
        .stButton > button,
        .stButton > button[kind="primary"],
        .stButton > button[kind="secondary"] {
            min-width: 120px !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 46px !important;
            padding: 0.5rem 1.5rem !important;
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
            text-align: center !important;
            white-space: nowrap !important;
            line-height: 1 !important;
            flex: 1 !important;
        }
        
        .stButton > button > div,
        .stButton > button[kind="primary"] > div,
        .stButton > button[kind="secondary"] > div {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            text-align: center !important;
        }
        .stButton > button:hover,
        .stButton > button[kind="primary"]:hover,
        .stButton > button[kind="secondary"]:hover {
            background: linear-gradient(135deg, #10B981 0%, #059669 70%, #047857 100%) !important;
            color: #ffffff !important;
            transform: translateY(-1px);
            box-shadow: 0 10px 25px rgba(16, 185, 129, 0.25) !important;
        }
        .stButton > button:focus,
        .stButton > button:active,
        .stButton > button[kind="primary"]:focus,
        .stButton > button[kind="secondary"]:focus {
            color: #ffffff !important;
            background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 70%, #1E3A8A 100%) !important;
        }
        .stButton > button p,
        .stButton > button span,
        .stButton > button div,
        .stButton > button[kind="secondary"] p,
        .stButton > button[kind="secondary"] span {
            color: #ffffff !important;
        }
        .stButton > button:hover p,
        .stButton > button:hover span,
        .stButton > button:hover div {
            color: #ffffff !important;
        }

        /* ✅ Slightly smaller MAIN hero title */
        .hero-title{
            color:#0F2D4A;
            font-size: 2.92rem;   /* was 3.10rem */
            font-weight: 900;
            letter-spacing:-0.02em;
            line-height: 1.12;
            margin: 0 0 0.9rem 0;
        }

        /* ✅ Keep subtitle size BIG (do NOT reduce) */
        .hero-sub{
            color:#475569;
            font-size: 1.35rem;   /* back to big like before */
            font-weight: 500;
            line-height: 1.5;
            margin: 0 0 1.35rem 0;
        }

        /* CTA Get Started */
        .cta-row{
            display:flex;
            gap: 0.9rem;
            flex-wrap: wrap;
            align-items:center;
            margin-top: 0.35rem;
        }
        .cta-link{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            padding: 1.0rem 1.7rem;
            border-radius: 999px;
            font-weight: 900;
            font-size: 1.18rem;
            text-decoration:none !important;
            color: #ffffff !important;
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 60%, #1E40AF 100%);
            box-shadow: 0 14px 30px rgba(37,99,235,0.20);
        }
        .cta-link:visited{ color:#ffffff !important; }
        
        /* Get Started button specific styling */
        [data-testid="stButton"][class*="st-key-hero_start"] button,
        button[kind="primary"] {
            min-width: 200px !important;
            min-height: 60px !important;
            padding: 1rem 2.5rem !important;
            font-size: 1.2rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
            gap: 0.5rem !important;
        }
        
        [data-testid="stButton"][class*="st-key-hero_start"] button > div,
        button[kind="primary"] > div {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 0.5rem !important;
            width: auto !important;
        }

        /* Feature cards */
        .feat-grid{
            display:grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1.1rem;
            margin-top: 1.2rem;
            margin-bottom: 0.55rem; /* a little more breathing room below cards */
        }
        .feat-card{
            background: rgba(255,255,255,0.72);
            border: 1px solid rgba(148,163,184,0.22);
            border-radius: 18px;
            padding: 1.35rem 1.25rem;
            box-shadow: 0 10px 28px rgba(15,23,42,0.06);
            transition: transform .15s ease, box-shadow .15s ease;
            text-align:center;
            min-height: 175px;
        }
        .feat-card:hover{
            transform: translateY(-3px);
            box-shadow: 0 16px 40px rgba(15,23,42,0.09);
        }
        .feat-ico{
            font-size: 3.2rem;
            margin-bottom: 0.6rem;
        }
        .feat-title{
            font-size: 1.25rem;
            font-weight: 900;
            color:#0F2D4A;
            margin: 0 0 0.35rem 0;
        }
        .feat-desc{
            font-size: 1.05rem;
            font-weight: 500;
            color:#64748B;
            margin: 0;
        }

        /* How it works */
        .how-title{
            text-align:center;
            color:#0F2D4A;
            font-size: 2.05rem;
            font-weight: 900;
            margin: 2.3rem 0 1.2rem 0;
        }
        .how-row{
            display:flex;
            align-items:center;
            justify-content:center;
            gap: 1.1rem;
            flex-wrap: wrap;
            margin-top: 0.4rem;
        }
        .how-step{
            display:flex;
            align-items:center;
            gap: 0.85rem;
            padding: 1.05rem 1.25rem;  /* slightly bigger */
            border-radius: 16px;
            background: rgba(239,246,255,0.85);
            border: 1px solid rgba(37,99,235,0.18);
        }
        .how-ico{
            font-size: 2.65rem;      /* slightly bigger */
            line-height: 1;
        }
        .how-text{
            font-size: 1.22rem;      /* slightly bigger */
            font-weight: 900;
            color:#0F2D4A;
            margin: 0;
        }
        .how-arrow{
            font-size: 2.05rem;      /* slightly bigger */
            font-weight: 900;
            color:#2563EB;
            opacity: 0.9;
        }

        /* Footer */
        .foot-wrap{
            margin-top: 2.6rem;
            padding-top: 1.6rem;
            border-top: 1px solid rgba(148,163,184,0.30);
            text-align:center;
        }
        .foot-links a{
            font-size: 1.08rem;
            font-weight: 900;
            color:#2563EB !important;
            text-decoration:none !important;
            margin: 0 0.9rem;
        }
        .foot-sub{
            margin-top: 0.7rem;
            color:#64748B;
            font-size: 1.03rem;
            font-weight: 600;
        }

        /* Responsive */
        @media (max-width: 1050px){
            .feat-grid{ grid-template-columns: repeat(2, 1fr); }
            .hero-title{ font-size: 2.45rem; }
            .hero-sub{ font-size: 1.25rem; }
            .hero-img{ height: 320px; max-width: 110%; transform: translateX(-14px) translateY(10px); }
            .nav-btn{ min-width: 124px; height: 48px; }
            .brand{ font-size: 2.02rem; }
        }
        @media (max-width: 620px){
            section.main > div.block-container { padding-left: 1.1rem; padding-right: 1.1rem; }
            .feat-grid{ grid-template-columns: 1fr; }
            .nav-actions{ margin-right: 0.1rem; }
            .hero-img{ height: 260px; max-width: 100%; transform: none; }
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
    
    # Add RTL support for Urdu
    if is_urdu():
        st.markdown("""
        <style>
        .stApp { direction: rtl; }
        .hero-title, .hero-sub, .feat-title, .feat-desc, .how-title, .how-text { direction: rtl; text-align: right; }
        .brand { direction: ltr; }
        </style>
        """, unsafe_allow_html=True)

    # Header with Streamlit buttons (no HTML links) - equal width for all nav buttons
    # Using gap="small" to ensure consistent spacing
    col_brand, col_space, col_lang_en, col_lang_ur, col_about, col_faq = st.columns([2.2, 0.2, 1, 1, 1, 1], gap="small")
    
    with col_brand:
        st.markdown(f'<div class="brand">{t("brand")}</div>', unsafe_allow_html=True)
    
    with col_lang_en:
        # English button - highlight if selected
        btn_style = "primary" if get_language() == "en" else "secondary"
        if st.button("English", key="lang_en", use_container_width=True, type=btn_style):
            set_language("en")
            st.rerun()
    
    with col_lang_ur:
        # Urdu button - highlight if selected
        btn_style = "primary" if get_language() == "ur" else "secondary"
        if st.button("اردو", key="lang_ur", use_container_width=True, type=btn_style):
            set_language("ur")
            st.rerun()
    
    with col_about:
        if st.button(t("about"), key="nav_about", use_container_width=True):
            _safe_navigate("about")
    
    with col_faq:
        if st.button(t("faq"), key="nav_faq", use_container_width=True):
            _safe_navigate("faq")

    st.markdown('<hr style="border:none;border-top:1px solid rgba(148,163,184,0.25);margin:0.6rem 0 1.3rem 0;">', unsafe_allow_html=True)

    # HERO (keep nice balance)
    left, right = st.columns([1.2, 1.2], gap="large")

    with left:
        st.markdown(
            f"""
            <div class="hero-left" style="padding: 0.6rem 0;">
              <div class="hero-title">{t("adaptive_tutor")}</div>
              <div class="hero-sub">{t("hero_subtitle")}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        
        # Get Started button using Streamlit (not HTML link)
        cta_col, spacer = st.columns([1, 2])
        with cta_col:
            if st.button(f"🚀 {t('get_started')}", key="hero_start", type="primary", use_container_width=True):
                _safe_navigate("signup")

    with right:
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

        if hero_path:
            # ✅ Slightly bigger + slight overlap toward the Get Started button
            uri = _img_to_data_uri(hero_path)
            st.markdown(
                f"""
                <div class="hero-right" style="display:flex; justify-content:flex-end; align-items:flex-start;">
                    <img class="hero-img" src="{uri}" alt="AutiStudy Hero" />
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            # Fallback
            st.markdown(
                """
                <div style="text-align:right; padding: 1.0rem 0;">
                    <div style="font-size: 7.2rem; line-height: 1;">👩‍🎓🤖</div>
                    <div style="margin-top: 0.6rem; color:#64748B; font-size:1.15rem; font-weight:800;">
                        AI-Powered Learning for Every Student
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

    # Features
    st.markdown(
        f"""
        <div class="feat-grid">
          <div class="feat-card">
            <div class="feat-ico">🤖</div>
            <div class="feat-title">{t("ai_tutor")}</div>
            <p class="feat-desc">{t("ai_tutor_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">📚</div>
            <div class="feat-title">{t("multimodal")}</div>
            <p class="feat-desc">{t("multimodal_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">🎯</div>
            <div class="feat-title">{t("personalized")}</div>
            <p class="feat-desc">{t("personalized_desc")}</p>
          </div>
          <div class="feat-card">
            <div class="feat-ico">🏆</div>
            <div class="feat-title">{t("your_progress")}</div>
            <p class="feat-desc">{t("stars_earned")}</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # How it works
    st.markdown(f'<div class="how-title">{t("how_it_works")}</div>', unsafe_allow_html=True)
    
    # Use appropriate arrow direction for RTL
    arrow = "←" if is_urdu() else "→"
    st.markdown(
        f"""
        <div class="how-row">
          <div class="how-step"><div class="how-ico">📝</div><div class="how-text">{t("step1")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">💬</div><div class="how-text">{t("step2")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">📖</div><div class="how-text">{t("step3")}</div></div>
          <div class="how-arrow">{arrow}</div>
          <div class="how-step"><div class="how-ico">📊</div><div class="how-text">{t("step4")}</div></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Footer only
    st.markdown(
        """
        <div class="foot-wrap">
          <div class="foot-links">
            <span style="color:#2563EB; font-weight:900; margin:0 0.9rem; cursor:pointer;">Privacy Policy</span> |
            <span style="color:#2563EB; font-weight:900; margin:0 0.9rem; cursor:pointer;">Terms</span> |
            <span style="color:#2563EB; font-weight:900; margin:0 0.9rem; cursor:pointer;">Contact</span>
          </div>
          <div class="foot-sub">© 2024 AutiStudy. Made with ❤️ for students in Pakistan</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
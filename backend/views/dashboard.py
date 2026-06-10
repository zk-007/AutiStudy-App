import streamlit as st
from utils.auth import logout
from utils.language import t, is_urdu

def render_dashboard():
    user = st.session_state.user

    # RTL support for Urdu
    if is_urdu():
        st.markdown("""
        <style>
        .stApp { direction: rtl; }
        </style>
        """, unsafe_allow_html=True)

    # ── Global styles ──────────────────────────────────────────────────────────
    st.markdown("""
    <style>

    /* ===============================
       FIX MAIN LAYOUT (IMPORTANT)
    ================================*/
    .main .block-container {
        padding-top: 2rem;
        padding-left: 1.5rem;
        padding-right: 1.5rem;
    }

    /* ===============================
       SIDEBAR SAFE STYLING
    ================================*/
    section[data-testid="stSidebar"] {
        background-color: #f8f9fc;
        padding-top: 1rem;
    }

    /* hide default multipage navigation */
    div[data-testid="stSidebarNav"] {
        display: none;
    }

    /* sidebar buttons */
    section[data-testid="stSidebar"] .stButton > button {
        width: 100%;
        border-radius: 10px;
        padding: 10px;
        background-color: #ffffff;
        border: 1px solid #e6e6e6;
        transition: all 0.2s ease;
    }

    section[data-testid="stSidebar"] .stButton > button:hover {
        background-color: #f1f3f8;
    }

    /* ===============================
       DASHBOARD CARDS
    ================================*/
    .dashboard-card {
        background-color: white;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #e8e8e8;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        height: 100%;
    }

    /* Quick-action cards */
    .qa-card {
        border-radius: 16px;
        padding: 1.5rem 1rem;
        text-align: center;
        color: white;
        margin-bottom: 0.8rem;
        min-height: 150px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    /* Rewards card */
    .rewards-box {
        background: white;
        border-radius: 20px;
        padding: 1.5rem;
        box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        text-align: center;
    }

    /* Subject cards */
    .subj-card {
        background: #F8FAFC;
        border-radius: 16px;
        padding: 1.5rem 1rem;
        text-align: center;
        border: 2px solid #E2E8F0;
        margin-bottom: 0.75rem;
    }

    /* Subjects wrapper */
    .subjects-wrap {
        background: white;
        border-radius: 20px;
        padding: 1.5rem 1.5rem 0.5rem 1.5rem;
        box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        margin-bottom: 1rem;
    }

    /* ===============================
       FIX OVERFLOW (important)
    ================================*/
    html, body {
        overflow-x: hidden;
    }

    </style>
    """, unsafe_allow_html=True)

    # ── SIDEBAR ────────────────────────────────────────────────────────────────
    with st.sidebar:
        first_letter = user.get("name", "S")[0].upper()
        name         = user.get("name", "Student")
        grade_num    = user.get("grade", 4)
        stars        = user.get("stars", 0)

        # Avatar + name + grade
        st.markdown(f"""
        <div style="text-align:center; padding-bottom:1rem;
             border-bottom:1px solid #E2E8F0; margin-bottom:1rem;">
            <div style="width:72px;height:72px;border-radius:50%;
                background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);
                display:flex;align-items:center;justify-content:center;
                margin:0 auto 0.6rem;color:white;font-size:1.8rem;font-weight:700;">
                {first_letter}
            </div>
            <div style="color:#1E3A5F;font-weight:700;font-size:1.1rem;">{name}</div>
            <div style="color:#2563EB;font-size:0.95rem;">{t('grade')} {grade_num}</div>
        </div>
        """, unsafe_allow_html=True)

        # Stars badge
        st.markdown(f"""
        <div style="text-align:center;margin-bottom:1.2rem;">
            <span style="background:linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%);
                color:white;padding:0.4rem 1.2rem;border-radius:20px;
                font-weight:700;font-size:0.95rem;display:inline-block;">
                ⭐ {stars} {t('stars_earned')}
            </span>
        </div>
        """, unsafe_allow_html=True)

        # Nav buttons
        if st.button(f"🤖 {t('ai_tutor')}",          key="nav_ai_tutor",  use_container_width=True):
            st.session_state.navigate("ai_tutor")
        if st.button(f"📝 {t('practice_quiz')}",      key="nav_practice",  use_container_width=True):
            st.session_state.navigate("practice_quiz")
        if st.button(f"📊 {t('learning_analytics')}", key="nav_analytics", use_container_width=True):
            st.session_state.navigate("analytics")
        if st.button(f"🏆 {t('earn_rewards')}",       key="nav_rewards",   use_container_width=True):
            st.info(t("coming_soon"))
        if st.button("⚙️ Settings",                   key="nav_settings",  use_container_width=True):
            st.info(t("coming_soon"))

        st.markdown("<div style='height:2rem'></div>", unsafe_allow_html=True)

        if st.button(f"🚪 {t('logout')}", key="nav_logout", use_container_width=True):
            logout()
            st.session_state.navigate("landing")

    # ── MAIN CONTENT ───────────────────────────────────────────────────────────

    # Welcome heading
    st.markdown(f"""
    <h1 style="color:#1E3A5F;font-weight:800;margin-bottom:1.5rem;">
        {t('welcome_back_name')}, {user.get('name','Student')}! 👋
    </h1>
    <h3 style="color:#1E3A5F;font-weight:700;margin-bottom:1rem;">{t('quick_actions')}</h3>
    """, unsafe_allow_html=True)

    # ── Quick Actions ──────────────────────────────────────────────────────────
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.markdown(f"""
        <div class="qa-card" style="background:linear-gradient(135deg,#60A5FA 0%,#3B82F6 100%);">
            <div style="font-size:2.8rem;margin-bottom:0.4rem;">🤖</div>
            <div style="font-weight:700;font-size:1.1rem;">{t('chat_with_tutor')}</div>
            <div style="font-size:0.95rem;opacity:0.9;">{t('ask_any_question')}</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button(t("start_chat"), key="quick_chat", use_container_width=True):
            st.session_state.navigate("ai_tutor")

    with col2:
        st.markdown(f"""
        <div class="qa-card" style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);">
            <div style="font-size:2.8rem;margin-bottom:0.4rem;">📝</div>
            <div style="font-weight:700;font-size:1.1rem;">{t('practice_quiz')}</div>
            <div style="font-size:0.95rem;opacity:0.9;">{t('test_knowledge')}</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button(t("start_practice"), key="quick_practice", use_container_width=True):
            st.session_state.navigate("practice_quiz")

    with col3:
        st.markdown(f"""
        <div class="qa-card" style="background:linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%);">
            <div style="font-size:2.8rem;margin-bottom:0.4rem;">📊</div>
            <div style="font-weight:700;font-size:1.1rem;">{t('learning_analytics')}</div>
            <div style="font-size:0.95rem;opacity:0.9;">{t('track_progress')}</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button(t("view_progress"), key="quick_analytics", use_container_width=True):
            st.session_state.navigate("analytics")

    with col4:
        st.markdown(f"""
        <div class="qa-card" style="background:linear-gradient(135deg,#F59E0B 0%,#D97706 100%);">
            <div style="font-size:2.8rem;margin-bottom:0.4rem;">🏆</div>
            <div style="font-weight:700;font-size:1.1rem;">{t('earn_rewards')}</div>
            <div style="font-size:0.95rem;opacity:0.9;">{t('collect_badges')}</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button(t("view_rewards"), key="quick_rewards", use_container_width=True):
            st.info(t("coming_soon"))

    st.markdown("<div style='height:1.5rem'></div>", unsafe_allow_html=True)

    # ── Your Subjects + Your Rewards ──────────────────────────────────────────
    col_main, col_side = st.columns([2, 1])

    grade = user.get("grade", 4)
    GRADE_SUBJECTS = {
        4: ["Maths", "General Science"],
        5: ["Maths", "General Science"],
        6: ["Maths", "General Science", "Computer"],
        7: ["Maths", "General Science", "Computer"],
    }
    subjects = GRADE_SUBJECTS.get(grade, ["Maths", "General Science"])
    subject_icons = {"Maths": "🔢", "General Science": "🔬", "Computer": "💻"}
    subject_translations = {
        "Maths":           t("maths"),
        "General Science": t("general_science"),
        "Computer":        t("computer"),
    }

    with col_main:
        st.markdown(f"""
        <div class="subjects-wrap">
            <h3 style="color:#1E3A5F;font-weight:700;margin:0 0 1rem 0;">{t('your_subjects')}</h3>
        </div>
        """, unsafe_allow_html=True)

        sub_cols = st.columns(len(subjects))
        for scol, subject in zip(sub_cols, subjects):
            with scol:
                icon            = subject_icons.get(subject, "📚")
                translated_subj = subject_translations.get(subject, subject)
                # Each subject card is its own markdown call — no nested flex/spans
                st.markdown(f"""
                <div class="subj-card">
                    <div style="font-size:3.2rem;margin-bottom:0.4rem;">{icon}</div>
                    <div style="color:#1E3A5F;font-weight:700;font-size:1.2rem;">{translated_subj}</div>
                    <div style="color:#64748B;font-size:0.95rem;">{t('grade')} {grade}</div>
                </div>
                """, unsafe_allow_html=True)
                if st.button(f"{t('study')} {translated_subj}",
                             key=f"study_{subject}", use_container_width=True):
                    st.session_state.selected_grade   = grade
                    st.session_state.selected_subject = subject
                    st.session_state.navigate("chat")

    with col_side:
        stars = user.get("stars", 0)
        rewards_title   = t('your_rewards')
        stars_label     = t('stars_earned')
        keep_learning   = t('keep_learning')

        st.markdown(f"""
        <div class="dashboard-card" style="text-align: center; min-height: 380px;">
            <h3 style="color:#1E3A5F;font-weight:700;margin-bottom:1.5rem;text-align:left;">{rewards_title}</h3>
            <div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:0.4rem;">
                <span style="font-size:4rem;color:#F59E0B;font-weight:800;">{stars}</span>
                <span style="font-size:3.5rem;">⭐</span>
            </div>
            <p style="color:#64748B;font-size:1.2rem;margin:0.3rem 0 2rem 0;">{stars_label}</p>
            <div style="display:flex;justify-content:center;gap:1.2rem;margin-bottom:2rem;font-size:2.8rem;">
                <span>🏅</span><span>🎯</span><span>⭐</span><span>🌟</span>
            </div>
            <p style="color:#64748B;font-size:1.15rem;">{keep_learning}</p>
        </div>
        """, unsafe_allow_html=True)

    # ── Footer ─────────────────────────────────────────────────────────────────
    st.markdown("<div style='height:2rem'></div>", unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align:center;padding:1rem;border-top:1px solid #E2E8F0;
         color:#94A3B8;font-size:0.9rem;">
        By using our services, you agree to our
        <a href="#" style="color:#2563EB;">Privacy Policy</a> and
        <a href="#" style="color:#2563EB;">Terms of Service</a>.
    </div>
    """, unsafe_allow_html=True)

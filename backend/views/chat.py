import html
import streamlit as st
import streamlit.components.v1 as components
from utils.llm import generate_response, generate_image, text_to_speech_base64, generate_response_with_auto_image
from utils.auth import logout
from utils.chat_db import (
    get_user_chats,
    create_chat_session,
    save_message,
    get_chat_session,
    save_media_to_message,
    cleanup_empty_sessions,
)
from utils.language import t, is_urdu, get_language


def scroll_to_bottom():
    """Inject JavaScript to scroll to the bottom of the page"""
    js = """
    <script>
        setTimeout(function() {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    </script>
    """
    components.html(js, height=0)


PRIMARY_GRADIENT = "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)"


def render_chat():
    user = st.session_state.user
    grade = st.session_state.selected_grade or user.get("grade", 4)
    subject = st.session_state.selected_subject or "Maths"
    user_email = user.get("email", "guest")
    current_language = get_language()

    initialize_chat_state(user_email, grade, subject, current_language)
    apply_global_styles()

    render_left_sidebar(user, grade, subject, user_email, current_language)
    render_main_content(grade, subject, user_email)


# =========================
# State + Styles
# =========================
def initialize_chat_state(user_email, grade, subject, current_language):
    # Auto-cleanup empty sessions once per session
    if "empty_sessions_cleaned" not in st.session_state:
        cleanup_empty_sessions()
        st.session_state.empty_sessions_cleaned = True
    
    # Don't create a new chat session automatically - only when user sends first message
    # Just initialize the session state variables
    if "current_chat_id" not in st.session_state:
        st.session_state.current_chat_id = None  # Will be created on first message

    st.session_state.setdefault("chat_history", [])
    st.session_state.setdefault("generated_images", {})
    st.session_state.setdefault("generated_audio", {})


def apply_global_styles():
    rtl = is_urdu()
    text_align = "right" if rtl else "left"
    direction = "rtl" if rtl else "ltr"

    st.markdown(
        f"""
        <style>
        html, body, [data-testid="stAppViewContainer"], .stApp, .main {{
            max-width: 100vw !important;
            overflow-x: hidden !important;
        }}

        div.block-container {{
            max-width: 100% !important;
            padding-top: 1.2rem !important;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
            padding-bottom: 2rem !important;
        }}

        /* Sidebar basic styling - let Streamlit handle collapse/expand */
        section[data-testid="stSidebar"] {{
            background: #FFFFFF !important;
        }}

        section[data-testid="stSidebar"] .block-container {{
            padding-top: 1rem !important;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
        }}

        .sidebar-card {{
            background: white;
            border-radius: 22px;
            padding: 1.4rem 1rem;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
            border: 1px solid #E2E8F0;
            text-align: center;
            margin-bottom: 1rem;
        }}

        .avatar-circle {{
            width: 78px;
            height: 78px;
            border-radius: 50%;
            margin: 0 auto 0.9rem auto;
            background: {PRIMARY_GRADIENT};
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            font-weight: 700;
        }}

        .sidebar-name {{
            color: #1E3A5F;
            margin: 0;
            font-weight: 800;
            font-size: 1.45rem;
        }}

        .sidebar-subtitle {{
            color: #2563EB;
            margin: 0.35rem 0 0 0;
            font-size: 1rem;
            font-weight: 500;
        }}

        .sidebar-section-title {{
            color: #1E3A5F;
            font-size: 1.05rem;
            font-weight: 800;
            margin: 1rem 0 0.6rem 0;
        }}

        .session-box {{
            background: #EFF6FF;
            border: 1px solid #DBEAFE;
            border-radius: 14px;
            padding: 1rem;
            margin-top: 1rem;
        }}

        .session-box p {{
            margin: 0.15rem 0;
            color: #475569;
            font-size: 0.95rem;
        }}

        .page-title-wrap {{
            margin-bottom: 1.3rem;
        }}

        .page-title {{
            color: #1E3A5F;
            font-size: clamp(2rem, 4vw, 3.1rem);
            line-height: 1.05;
            font-weight: 850;
            margin: 0;
        }}

        .page-subtitle {{
            color: #64748B;
            font-size: 1.15rem;
            margin-top: 0.25rem;
            margin-bottom: 0;
        }}

        .intro-box {{
            background: linear-gradient(135deg, #DBEAFE 0%, #E0E7FF 50%, #EDE9FE 100%);
            border-radius: 18px;
            padding: 1.35rem;
            margin-bottom: 1.35rem;
            border-left: 4px solid #2563EB;
        }}

        .intro-flex {{
            display: flex;
            align-items: flex-start;
            gap: 0.9rem;
        }}

        .intro-emoji {{
            font-size: 2rem;
            line-height: 1;
            flex-shrink: 0;
        }}

        .intro-title {{
            color: #1E3A5F;
            font-weight: 800;
            font-size: 1.2rem;
            margin: 0 0 0.45rem 0;
        }}

        .intro-text {{
            color: #475569;
            margin: 0;
            font-size: 1.08rem;
            line-height: 1.7;
        }}

        .intro-example {{
            color: #64748B;
            font-size: 1rem;
            margin: 0.55rem 0 0 0;
        }}

        .section-label {{
            color: #1E3A5F;
            font-weight: 700;
            font-size: 1.1rem;
            margin: 0.6rem 0 0.55rem 0;
        }}

        .hint-label {{
            color: #64748B;
            font-size: 1rem;
            margin: 0.75rem 0 0.7rem 0;
        }}

        .input-shell {{
            border: 1px solid #CBD5E1;
            background: rgba(255,255,255,0.35);
            border-radius: 16px;
            padding: 0.9rem;
            margin-bottom: 0.4rem;
        }}

        .stTextInput > div > div > input {{
            border-radius: 18px !important;
            min-height: 54px !important;
            font-size: 1.05rem !important;
        }}

        .stButton > button,
        .stFormSubmitButton > button {{
            background: {PRIMARY_GRADIENT} !important;
            color: white !important;
            border: none !important;
            border-radius: 18px !important;
            font-size: 1rem !important;
            font-weight: 650 !important;
            min-height: 54px !important;
            padding: 0.7rem 1rem !important;
            width: 100% !important;
            box-shadow: 0 6px 18px rgba(37, 99, 235, 0.18) !important;
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: anywhere !important;
            line-height: 1.35 !important;
        }}

        .stButton > button:hover,
        .stFormSubmitButton > button:hover {{
            background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%) !important;
            color: white !important;
        }}

        .stButton > button:focus,
        .stFormSubmitButton > button:focus {{
            box-shadow: 0 0 0 0.18rem rgba(59, 130, 246, 0.22) !important;
        }}

        .stForm [data-testid="InputInstructions"],
        div[data-testid="InputInstructions"] {{
            display: none !important;
            visibility: hidden !important;
        }}

        [data-testid="stChatMessage"] [data-testid="stMarkdownContainer"],
        [data-testid="stChatMessageContent"] {{
            direction: {direction} !important;
            text-align: {text_align} !important;
        }}

        .dir-wrap {{
            direction: {direction};
            text-align: {text_align};
        }}

        .previous-empty {{
            background: #F8FAFC;
            border: 1px dashed #CBD5E1;
            color: #64748B;
            border-radius: 14px;
            padding: 0.95rem;
            text-align: center;
            line-height: 1.55;
            font-size: 0.95rem;
        }}

        audio {{
            width: 100%;
            max-width: 100%;
        }}

        @media (max-width: 900px) {{
            div.block-container {{
                padding-left: 0.75rem !important;
                padding-right: 0.75rem !important;
            }}

            .intro-flex {{
                gap: 0.7rem;
            }}

            .page-title {{
                font-size: 2.1rem;
            }}
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


# =========================
# Sidebar
# =========================
def render_left_sidebar(user, grade, subject, user_email, current_language):
    with st.sidebar:
        first_letter = user.get("name", "S")[0].upper()
        safe_name = html.escape(user.get("name", "Student"))
        safe_subject = html.escape(str(subject))

        st.markdown(
            f"""
            <div class="sidebar-card">
                <div class="avatar-circle">{first_letter}</div>
                <h3 class="sidebar-name">{safe_name}</h3>
                <p class="sidebar-subtitle">Grade {grade} - {safe_subject}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        if st.button(f"🏠 {t('dashboard')}", key="nav_dashboard", use_container_width=True):
            st.session_state.navigate("dashboard")

        if st.button(f"🤖 {t('change_subject')}", key="nav_ai_tutor", use_container_width=True):
            st.session_state.current_chat_id = None
            st.session_state.chat_history = []
            st.session_state.generated_images = {}
            st.session_state.generated_audio = {}
            st.session_state.welcome_shown = False  # Reset for new subject
            st.session_state.navigate("ai_tutor")

        if st.button(f"➕ {t('new_chat')}", key="new_chat", use_container_width=True):
            st.session_state.current_chat_id = create_chat_session(
                user_email, grade, subject, current_language
            )
            st.session_state.chat_history = []
            st.session_state.generated_images = {}
            st.session_state.generated_audio = {}
            st.session_state.welcome_shown = False  # Reset for new chat
            st.rerun()

        if st.button(f"🗑️ {t('clear_chat')}", key="clear_chat", use_container_width=True):
            st.session_state.chat_history = []
            st.session_state.generated_images = {}
            st.session_state.generated_audio = {}
            st.session_state.welcome_shown = False  # Reset to show welcome again
            st.rerun()

        if st.button(f"🚪 {t('logout')}", key="nav_logout", use_container_width=True):
            logout()
            st.session_state.navigate("landing")

        st.markdown(
            f"<div class='sidebar-section-title'>📂 {t('previous_chats')}</div>",
            unsafe_allow_html=True,
        )
        render_previous_chats(user_email, current_language, grade, subject)

        st.markdown(
            f"""
            <div class="session-box">
                <p><strong>{t('current_session')}</strong></p>
                <p>{t('grade')}: {grade}</p>
                <p>{t('subject')}: {safe_subject}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_previous_chats(user_email, current_language, grade, subject):
    previous_chats = get_user_chats(user_email, current_language)

    if not previous_chats:
        st.markdown(
            f"<div class='previous-empty'>{t('no_previous_chats')}</div>",
            unsafe_allow_html=True,
        )
        return

    for idx, chat in enumerate(previous_chats[:10]):
        chat_title = chat.get("title", "Untitled")
        chat_id = chat.get("id", "")

        if len(chat_title) > 32:
            chat_title = chat_title[:32] + "..."

        is_current = chat_id == st.session_state.current_chat_id
        label = f"💬 {'⭐ ' if is_current else ''}{chat_title}"

        if st.button(label, key=f"sidebar_chat_{chat_id}_{idx}", use_container_width=True):
            session = get_chat_session(user_email, chat_id)
            if session:
                st.session_state.current_chat_id = chat_id
                st.session_state.selected_grade = session.get("grade", grade)
                st.session_state.selected_subject = session.get("subject", subject)
                st.session_state.chat_history = session.get("messages", [])

                st.session_state.generated_images = {}
                st.session_state.generated_audio = {}
                messages = session.get("messages", [])
                pair_idx = 0
                for msg in messages:
                    if msg.get("role") == "assistant":
                        if msg.get("image_url"):
                            st.session_state.generated_images[pair_idx] = msg["image_url"]
                        if msg.get("audio_base64"):
                            st.session_state.generated_audio[pair_idx] = msg["audio_base64"]
                        pair_idx += 1

                # Scroll to bottom when loading previous chat
                st.session_state.scroll_to_bottom = True
                st.rerun()


# =========================
# Main content
# =========================
def render_main_content(grade, subject, user_email):
    safe_subject = html.escape(str(subject))
    user = st.session_state.get("user", {})
    user_name = user.get("name", "Student")

    # Check if this is a fresh chat session (show welcome)
    show_welcome = not st.session_state.chat_history and not st.session_state.get("welcome_shown", False)
    
    if show_welcome:
        # Mark welcome as shown for this session
        st.session_state.welcome_shown = True
        
        # Trigger balloons celebration!
        st.balloons()

    st.markdown(
        f"""
        <div class="page-title-wrap dir-wrap">
            <h1 class="page-title">🤖 {t('ai_tutor_title')}</h1>
            <p class="page-subtitle">{t('grade')} {grade} - {safe_subject}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if not st.session_state.chat_history:
        tutor_intro = html.escape(t('tutor_intro').format(subject=subject, grade=grade))
        st.markdown(
            f"""
            <div class="intro-box dir-wrap">
                <div class="intro-flex">
                    <div class="intro-emoji">💡</div>
                    <div>
                        <p class="intro-title">{html.escape(t('how_to_ask'))}</p>
                        <p class="intro-text">{tutor_intro} 😊</p>
                        <p class="intro-example"><em>{html.escape(t('example_questions'))}</em></p>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        render_input_area(grade, subject, user_email, "initial")
        render_quick_questions(grade, subject, user_email)
    else:
        display_conversation_with_inputs(grade, subject, user_email)


# =========================
# Input + Quick buttons
# =========================
def render_input_area(grade, subject, user_email, key_suffix):
    st.markdown(
        f"<div class='section-label dir-wrap'>{html.escape(t('ask_question'))}</div>",
        unsafe_allow_html=True,
    )

    with st.container():
        with st.form(key=f"chat_form_{key_suffix}", clear_on_submit=True):
            input_col, button_col = st.columns([5.2, 1.2], gap="small")

            with input_col:
                user_input = st.text_input(
                    t('type_question'),
                    key=f"user_input_{key_suffix}",
                    placeholder=t('type_question'),
                    label_visibility="collapsed",
                )

            with button_col:
                send_button = st.form_submit_button(
                    f"{t('send')} 📤",
                    use_container_width=True,
                    type="primary",
                )

            if send_button and user_input and user_input.strip():
                process_user_input(user_input.strip(), grade, subject, user_email)


def render_quick_questions(grade, subject, user_email):
    st.markdown(
        f"<div class='hint-label dir-wrap'>{html.escape(t('quick_question'))}</div>",
        unsafe_allow_html=True,
    )

    quick_questions = {
        "Maths": [
            t("what_is_addition"),
            t("help_multiplication"),
            t("explain_fractions"),
            t("even_odd_numbers"),
        ],
        "General Science": [
            t("parts_of_plant"),
            t("solar_system"),
            t("states_of_matter"),
            t("how_magnets_work"),
        ],
        "Computer": [
            t("what_is_computer"),
            t("input_devices"),
            t("tell_about_internet"),
            t("what_is_software"),
        ],
    }

    questions = quick_questions.get(subject, quick_questions["Maths"])

    for row_start in range(0, len(questions), 2):
        row_questions = questions[row_start : row_start + 2]
        cols = st.columns(2, gap="medium")

        for idx, question in enumerate(row_questions):
            with cols[idx]:
                if st.button(
                    question,
                    key=f"quick_{row_start}_{idx}_{question}",
                    use_container_width=True,
                ):
                    process_user_input(question, grade, subject, user_email)


# =========================
# Chat processing
# =========================
def process_user_input(user_input, grade, subject, user_email):
    # Create chat session on FIRST message only (not on page load)
    if not st.session_state.current_chat_id:
        current_language = get_language()
        st.session_state.current_chat_id = create_chat_session(
            user_email, grade, subject, current_language
        )
    
    st.session_state.chat_history.append({
        "role": "user",
        "content": user_input,
    })
    save_message(user_email, st.session_state.current_chat_id, "user", user_input)

    try:
        with st.spinner("Thinking... 🤔"):
            # Use the new function that auto-generates images for "how" questions
            result = generate_response_with_auto_image(
                user_input,
                grade,
                subject,
                st.session_state.chat_history,
            )
        
        response = result.get("text_response", "")
        auto_image_url = result.get("image_url")
        
        if not response:
            response = "I'm having trouble answering right now. Please try again!"
            
    except Exception as e:
        print(f"Error generating response: {e}")
        response = f"I encountered an issue while thinking. Let me try again! (Error: {str(e)[:100]})"
        auto_image_url = None

    # Save the assistant message
    assistant_msg = {
        "role": "assistant",
        "content": response,
    }
    
    # If an image was auto-generated, include it
    if auto_image_url:
        assistant_msg["image_url"] = auto_image_url
        # Also store in generated_images for display
        pair_idx = len([m for m in st.session_state.chat_history if m.get("role") == "assistant"])
        st.session_state.generated_images[pair_idx] = auto_image_url
    
    st.session_state.chat_history.append(assistant_msg)
    save_message(user_email, st.session_state.current_chat_id, "assistant", response)
    
    # Save image to message if auto-generated
    if auto_image_url:
        msg_idx = len(st.session_state.chat_history) - 1
        save_media_to_message(
            user_email,
            st.session_state.current_chat_id,
            msg_idx,
            image_url=auto_image_url,
        )
    
    # Trigger scroll to bottom after response
    st.session_state.scroll_to_bottom = True
    st.rerun()


# =========================
# Conversation rendering
# =========================
def display_conversation_with_inputs(grade, subject, user_email):
    messages = st.session_state.chat_history
    i = 0
    pair_idx = 0

    while i < len(messages):
        msg = messages[i]

        if msg["role"] == "user":
            with st.chat_message("user", avatar="👤"):
                st.write(msg["content"])

            if i + 1 < len(messages) and messages[i + 1]["role"] == "assistant":
                assistant_msg = messages[i + 1]
                assistant_msg_idx = i + 1
                stored_image = assistant_msg.get("image_url")
                stored_audio = assistant_msg.get("audio_base64")

                with st.chat_message("assistant", avatar="🤖"):
                    st.write(assistant_msg["content"])

                    action_cols = st.columns([1, 1, 3], gap="small")

                    with action_cols[0]:
                        if st.button(
                            f"🖼️ {t('image_aid')}",
                            key=f"imageaid_{pair_idx}",
                            use_container_width=True,
                        ):
                            with st.spinner(f"{t('generating_image')} 🎨"):
                                image_url = generate_image(msg["content"], grade, subject)
                                if image_url:
                                    st.session_state.generated_images[pair_idx] = image_url
                                    save_media_to_message(
                                        user_email,
                                        st.session_state.current_chat_id,
                                        assistant_msg_idx,
                                        image_url=image_url,
                                    )
                                    st.session_state.scroll_to_bottom = True
                                    st.rerun()
                                else:
                                    st.error(f"❌ {t('image_failed')}")

                    with action_cols[1]:
                        if st.button(
                            f"🔊 {t('voice_aid')}",
                            key=f"voiceaid_{pair_idx}",
                            use_container_width=True,
                        ):
                            with st.spinner(f"🔊 {t('generating_voice')}..."):
                                language = get_language()
                                audio_base64 = text_to_speech_base64(
                                    assistant_msg["content"], language
                                )
                                if audio_base64:
                                    st.session_state.generated_audio[pair_idx] = audio_base64
                                    save_media_to_message(
                                        user_email,
                                        st.session_state.current_chat_id,
                                        assistant_msg_idx,
                                        audio_base64=audio_base64,
                                    )
                                    st.session_state.scroll_to_bottom = True
                                    st.rerun()
                                else:
                                    st.error(f"❌ {t('voice_failed')}")

                    display_image = st.session_state.generated_images.get(pair_idx) or stored_image
                    if display_image:
                        st.markdown(
                            f"<div class='section-label dir-wrap'>🖼️ {html.escape(t('generated_image'))}</div>",
                            unsafe_allow_html=True,
                        )
                        st.image(display_image, use_container_width=True)

                    display_audio = st.session_state.generated_audio.get(pair_idx) or stored_audio
                    if display_audio:
                        st.markdown(
                            f"<div class='section-label dir-wrap'>🔊 {html.escape(t('listen_response'))}</div>",
                            unsafe_allow_html=True,
                        )
                        st.markdown(
                            f"""
                            <audio controls>
                                <source src="data:audio/mp3;base64,{display_audio}" type="audio/mp3">
                                Your browser does not support the audio element.
                            </audio>
                            """,
                            unsafe_allow_html=True,
                        )

                i += 2
                pair_idx += 1
            else:
                i += 1
        else:
            with st.chat_message("assistant", avatar="🤖"):
                st.write(msg["content"])
            i += 1

    st.markdown(
        "<hr style='margin: 1.5rem 0; border: none; border-top: 1px solid #E2E8F0;'>",
        unsafe_allow_html=True,
    )

    render_input_area(grade, subject, user_email, f"bottom_{len(messages)}")
    render_quick_questions(grade, subject, user_email)
    
    # Auto-scroll to bottom if triggered
    if st.session_state.get("scroll_to_bottom", False):
        scroll_to_bottom()
        st.session_state.scroll_to_bottom = False

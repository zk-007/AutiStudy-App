import streamlit as st
from utils.auth import init_session_state, check_authentication
from utils.styles import apply_custom_styles
from utils.session import restore_session, inject_session_storage_script, update_session_page

st.set_page_config(
    page_title="AutiStudy - AI Tutor for Grades 4-7",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded"
)

apply_custom_styles()
init_session_state()

# Inject session storage script for persistence
inject_session_storage_script()

# Try to restore session from persistent storage
if not st.session_state.get("authenticated", False):
    if restore_session():
        pass

# Preload RAG models in background when user is authenticated
# This makes chat load instantly instead of waiting for models
if st.session_state.get("authenticated", False):
    from utils.rag import preload_models
    preload_models()

if "page" not in st.session_state:
    st.session_state.page = "landing"

def navigate_to(page):
    st.session_state.page = page
    if st.session_state.get("session_token"):
        update_session_page(st.session_state.session_token, page)
    st.rerun()

st.session_state.navigate = navigate_to

if st.session_state.page == "landing":
    from views.landing import render_landing
    render_landing()
elif st.session_state.page == "login":
    from views.login import render_login
    render_login()
elif st.session_state.page == "signup":
    from views.signup import render_signup
    render_signup()
elif st.session_state.page == "dashboard":
    if check_authentication():
        from views.dashboard import render_dashboard
        render_dashboard()
    else:
        navigate_to("login")
elif st.session_state.page == "ai_tutor":
    if check_authentication():
        from views.ai_tutor import render_ai_tutor
        render_ai_tutor()
    else:
        navigate_to("login")
elif st.session_state.page == "chat":
    if check_authentication():
        from views.chat import render_chat
        render_chat()
    else:
        navigate_to("login")
elif st.session_state.page == "about":
    from views.about import render_about
    render_about()
elif st.session_state.page == "faq":
    from views.faq import render_faq
    render_faq()
elif st.session_state.page == "practice_quiz":
    if check_authentication():
        from views.practice_quiz import render_practice_quiz
        render_practice_quiz()
    else:
        navigate_to("login")
elif st.session_state.page == "analytics":
    if check_authentication():
        from views.analytics import render_analytics
        render_analytics()
    else:
        navigate_to("login")
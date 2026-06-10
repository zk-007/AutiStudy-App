import streamlit as st
from utils.auth import init_session_state, check_authentication
from utils.styles import apply_custom_styles

st.set_page_config(
    page_title="AutiStudy - AI Tutor for Grades 4-7",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="collapsed"
)

apply_custom_styles()
init_session_state()

if "page" not in st.session_state:
    st.session_state.page = "landing"

def navigate_to(page):
    st.session_state.page = page
    st.rerun()

st.session_state.navigate = navigate_to

if st.session_state.page == "landing":
    from pages.landing import render_landing
    render_landing()
elif st.session_state.page == "login":
    from pages.login import render_login
    render_login()
elif st.session_state.page == "signup":
    from pages.signup import render_signup
    render_signup()
elif st.session_state.page == "dashboard":
    if check_authentication():
        from pages.dashboard import render_dashboard
        render_dashboard()
    else:
        navigate_to("login")
elif st.session_state.page == "ai_tutor":
    if check_authentication():
        from pages.ai_tutor import render_ai_tutor
        render_ai_tutor()
    else:
        navigate_to("login")
elif st.session_state.page == "chat":
    if check_authentication():
        from pages.chat import render_chat
        render_chat()
    else:
        navigate_to("login")

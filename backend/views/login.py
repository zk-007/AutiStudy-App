import streamlit as st
from utils.auth import authenticate_user
from utils.language import t, is_urdu

def render_login():
    # If already authenticated, redirect to dashboard
    if st.session_state.get("authenticated", False):
        st.session_state.navigate("dashboard")
        return
    # RTL support for Urdu + placeholder styling
    direction = "rtl" if is_urdu() else "ltr"
    text_align = "right" if is_urdu() else "left"
    
    st.markdown(f"""
    <style>
    .stApp {{ direction: {direction}; }}
    
    /* Light, small placeholders */
    input::placeholder {{
        color: #B0BEC5 !important;
        font-size: 0.9rem !important;
        font-weight: 400 !important;
        text-align: {text_align} !important;
    }}
    
    /* Input text alignment */
    .stTextInput input {{
        text-align: {text_align} !important;
    }}
    
    /* Hide "Press Enter to submit form" helper text */
    .stForm [data-testid="InputInstructions"],
    .stForm .st-emotion-cache-1gulkj5,
    div[data-testid="InputInstructions"] {{
        display: none !important;
        visibility: hidden !important;
    }}
    </style>
    """, unsafe_allow_html=True)
    
    # Header with back button
    col1, col2, col3 = st.columns([1, 6, 1])
    with col1:
        if st.button(f"← {t('back')}", key="back_to_home"):
            st.session_state.navigate("landing")
    with col2:
        st.markdown(f'<div style="text-align: center;"><span class="logo-text">{t("brand")}</span></div>', unsafe_allow_html=True)
    
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    # Login Card
    col1, col2, col3 = st.columns([1, 1.5, 1])
    
    with col2:
        st.markdown(f"""
        <div style="background: white; border-radius: 24px; padding: 2.5rem; box-shadow: 0 8px 30px rgba(0,0,0,0.1);">
            <h2 style="color: #1E3A5F; font-size: 2.4rem; font-weight: 800; margin-bottom: 0.5rem;">{t('login')}</h2>
            <p style="color: #64748B; margin-bottom: 1.5rem; font-size: 1.2rem;">{t('welcome_back')}</p>
        </div>
        """, unsafe_allow_html=True)
        
        with st.form("login_form"):
            st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("email")}:</p>', unsafe_allow_html=True)
            email = st.text_input("Email", label_visibility="collapsed", placeholder=t("enter_email"))
            
            st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("password")}:</p>', unsafe_allow_html=True)
            password = st.text_input("Password", type="password", label_visibility="collapsed", placeholder=t("enter_password"))
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            submitted = st.form_submit_button(t("login_btn"), use_container_width=True, type="primary")
            
            if submitted:
                if email and password:
                    success, user = authenticate_user(email, password)
                    if success:
                        st.session_state.authenticated = True
                        st.session_state.user = user
                        st.success(t("login_success"))
                        st.session_state.navigate("dashboard")
                    else:
                        st.error(t("login_failed"))
                else:
                    st.warning(t("fill_all_fields"))
        
        st.markdown(f"""
        <div style="text-align: center; margin-top: 1rem;">
            <a href="#" style="color: #2563EB; text-decoration: none; font-weight: 600;">{t('forgot_password')}</a>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        col_a, col_b, col_c = st.columns([1, 2, 1])
        with col_b:
            st.markdown(f'<p style="text-align: center; color: #64748B;">{t("no_account")}</p>', unsafe_allow_html=True)
            if st.button(t("create_account"), key="goto_signup", use_container_width=True):
                st.session_state.navigate("signup")

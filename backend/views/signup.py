import streamlit as st
from utils.auth import register_user
from utils.language import t, is_urdu

def render_signup():
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
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Signup Card
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.markdown(f"""
        <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border-radius: 24px; padding: 3rem; height: 100%; display: flex; align-items: center; justify-content: center;">
            <div style="text-align: center;">
                <div style="font-size: 10rem;">👨‍🎓🤖</div>
                <p style="color: #1E3A5F; font-size: 1.2rem; font-weight: 600; margin-top: 1rem;">
                    {t('start_journey')}
                </p>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.markdown(f"""
        <div style="background: white; border-radius: 24px; padding: 2rem; box-shadow: 0 8px 30px rgba(0,0,0,0.1);">
            <h2 style="color: #1E3A5F; font-size: 2.2rem; font-weight: 800; margin-bottom: 0.3rem;">{t('signup')}</h2>
            <p style="color: #64748B; margin-bottom: 1rem; font-size: 1.2rem;">{t('welcome_back')}</p>
        </div>
        """, unsafe_allow_html=True)
        
        with st.form("signup_form"):
            st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("name")}:</p>', unsafe_allow_html=True)
            name = st.text_input("Name", label_visibility="collapsed", placeholder=t("enter_name"))
            
            st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("email")}:</p>', unsafe_allow_html=True)
            email = st.text_input("Email", label_visibility="collapsed", placeholder=t("enter_email"))
            
            st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("password")}:</p>', unsafe_allow_html=True)
            password = st.text_input("Password", type="password", label_visibility="collapsed", placeholder=t("enter_password"))
            
            role_col, grade_col = st.columns(2)
            
            with role_col:
                st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("select_role")}:</p>', unsafe_allow_html=True)
                roles = [t("student"), t("teacher"), t("parent")]
                role = st.selectbox("Role", roles, label_visibility="collapsed")
            
            with grade_col:
                st.markdown(f'<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem; font-size: 1.2rem;">{t("grade")}:</p>', unsafe_allow_html=True)
                grade = st.selectbox("Grade", [4, 5, 6, 7], label_visibility="collapsed")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            agree = st.checkbox(t("agree_terms"))
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            submitted = st.form_submit_button(t("create_account"), use_container_width=True, type="primary")
            
            if submitted:
                if not name or not email or not password:
                    st.warning(t("fill_all_fields"))
                elif not agree:
                    st.warning(t("agree_to_terms"))
                else:
                    success, message = register_user(name, email, password, role, grade)
                    if success:
                        st.success(t("account_created"))
                        st.session_state.navigate("login")
                    else:
                        st.error(message)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        st.markdown(f'<p style="text-align: center; color: #64748B;">{t("have_account")}</p>', unsafe_allow_html=True)
        col_a, col_b, col_c = st.columns([1, 2, 1])
        with col_b:
            if st.button(t("login"), key="goto_login", use_container_width=True):
                st.session_state.navigate("login")

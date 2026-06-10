import streamlit as st
from utils.auth import authenticate_user

def render_login():
    # Header
    col1, col2, col3 = st.columns([1, 4, 1])
    with col1:
        if st.button("← Back", key="back_to_home"):
            st.session_state.navigate("landing")
    with col2:
        st.markdown('<p style="text-align: center; color: #2563EB; font-size: 2.5rem !important; font-weight: 800;">AutiStudy</p>', unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Login Card
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("""
        <div style="background: white; border-radius: 24px; padding: 3rem; box-shadow: 0 8px 30px rgba(0,0,0,0.1);">
        """, unsafe_allow_html=True)
        
        st.markdown("""
        <h2 style="color: #1E3A5F; font-size: 2.5rem !important; font-weight: 800; margin-bottom: 0.5rem;">Login</h2>
        <p style="color: #64748B; margin-bottom: 2rem; font-size: 1.3rem !important;">Welcome back! Please enter your details.</p>
        """, unsafe_allow_html=True)
        
        with st.form("login_form"):
            st.markdown('<p style="color: #1E3A5F; font-weight: 700; font-size: 1.3rem !important;">Email:</p>', unsafe_allow_html=True)
            email = st.text_input("Email", label_visibility="collapsed", placeholder="Enter your email")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            st.markdown('<p style="color: #1E3A5F; font-weight: 700; font-size: 1.3rem !important;">Password:</p>', unsafe_allow_html=True)
            password = st.text_input("Password", type="password", label_visibility="collapsed", placeholder="Enter your password")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            submitted = st.form_submit_button("Login", use_container_width=True, type="primary")
            
            if submitted:
                if email and password:
                    success, user = authenticate_user(email, password)
                    if success:
                        st.session_state.authenticated = True
                        st.session_state.user = user
                        st.success("Login successful!")
                        st.session_state.navigate("dashboard")
                    else:
                        st.error("Invalid email or password. Please try again.")
                else:
                    st.warning("Please enter both email and password.")
        
        st.markdown("""
        <p style="text-align: center; margin-top: 1.5rem;">
            <a href="#" style="color: #2563EB; text-decoration: none; font-weight: 700; font-size: 1.2rem !important;">Forgot Password?</a>
        </p>
        """, unsafe_allow_html=True)
        
        st.markdown("</div>", unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        st.markdown('<p style="text-align: center; color: #64748B; font-size: 1.2rem !important;">Don\'t have an account?</p>', unsafe_allow_html=True)
        
        col_a, col_b, col_c = st.columns([1, 2, 1])
        with col_b:
            if st.button("Create Account", key="goto_signup", use_container_width=True):
                st.session_state.navigate("signup")

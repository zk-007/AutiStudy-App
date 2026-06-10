import streamlit as st
from utils.auth import authenticate_user

def render_login():
    # Header with back button
    col1, col2, col3 = st.columns([1, 6, 1])
    with col1:
        if st.button("← Back", key="back_to_home"):
            st.session_state.navigate("landing")
    with col2:
        st.markdown('<div style="text-align: center;"><span style="color: #2563EB; font-size: 2.5rem; font-weight: 800;">AutiStudy</span></div>', unsafe_allow_html=True)
    
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    # Login Card
    col1, col2, col3 = st.columns([1, 1.5, 1])
    
    with col2:
        st.markdown("""
        <div style="background: white; border-radius: 24px; padding: 3rem; box-shadow: 0 8px 30px rgba(0,0,0,0.1);">
            <h2 style="color: #1E3A5F; font-size: 2.5rem; font-weight: 800; margin-bottom: 0.5rem;">Login</h2>
            <p style="color: #64748B; margin-bottom: 2rem; font-size: 1.2rem;">Welcome back! Please enter your details.</p>
        </div>
        """, unsafe_allow_html=True)
        
        with st.form("login_form"):
            st.markdown('<p style="color: #1E3A5F; font-weight: 700; margin-bottom: 0.5rem; font-size: 1.2rem;">Email:</p>', unsafe_allow_html=True)
            email = st.text_input("Email", label_visibility="collapsed", placeholder="Enter your email")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            st.markdown('<p style="color: #1E3A5F; font-weight: 700; margin-bottom: 0.5rem; font-size: 1.2rem;">Password:</p>', unsafe_allow_html=True)
            password = st.text_input("Password", type="password", label_visibility="collapsed", placeholder="Enter your password")
            
            st.markdown("<br><br>", unsafe_allow_html=True)
            
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
        <div style="text-align: center; margin-top: 1.5rem;">
            <a href="#" style="color: #2563EB; text-decoration: none; font-weight: 700; font-size: 1.2rem;">Forgot Password?</a>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        st.markdown('<p style="text-align: center; color: #64748B; font-size: 1.2rem;">Don\'t have an account?</p>', unsafe_allow_html=True)
        col_a, col_b, col_c = st.columns([1, 2, 1])
        with col_b:
            if st.button("Create Account", key="goto_signup", use_container_width=True):
                st.session_state.navigate("signup")

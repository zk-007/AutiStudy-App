import streamlit as st
from utils.auth import register_user

def render_signup():
    # Header with back button
    col1, col2, col3 = st.columns([1, 6, 1])
    with col1:
        if st.button("← Back", key="back_to_home"):
            st.session_state.navigate("landing")
    with col2:
        st.markdown('<div style="text-align: center;"><span class="logo-text">AutiStudy</span></div>', unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Signup Card
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%); border-radius: 24px; padding: 3rem; height: 100%; display: flex; align-items: center; justify-content: center;">
            <div style="text-align: center;">
                <div style="font-size: 10rem;">👨‍🎓🤖</div>
                <p style="color: #1E3A5F; font-size: 1.2rem; font-weight: 600; margin-top: 1rem;">
                    Start your learning journey today!
                </p>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    with col2:
        st.markdown("""
        <div style="background: white; border-radius: 24px; padding: 2rem; box-shadow: 0 8px 30px rgba(0,0,0,0.1);">
            <h2 style="color: #1E3A5F; font-size: 1.8rem; font-weight: 800; margin-bottom: 0.3rem;">Sign Up</h2>
            <p style="color: #64748B; margin-bottom: 1rem;">Create your account to get started!</p>
        </div>
        """, unsafe_allow_html=True)
        
        with st.form("signup_form"):
            st.markdown('<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem;">Name:</p>', unsafe_allow_html=True)
            name = st.text_input("Name", label_visibility="collapsed", placeholder="Enter your name")
            
            st.markdown('<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem;">Email:</p>', unsafe_allow_html=True)
            email = st.text_input("Email", label_visibility="collapsed", placeholder="Enter your email")
            
            st.markdown('<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem;">Password:</p>', unsafe_allow_html=True)
            password = st.text_input("Password", type="password", label_visibility="collapsed", placeholder="Create a password")
            
            role_col, grade_col = st.columns(2)
            
            with role_col:
                st.markdown('<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem;">Role:</p>', unsafe_allow_html=True)
                role = st.selectbox("Role", ["Student", "Teacher", "Parent"], label_visibility="collapsed")
            
            with grade_col:
                st.markdown('<p style="color: #1E3A5F; font-weight: 600; margin-bottom: 0.3rem;">Grade:</p>', unsafe_allow_html=True)
                grade = st.selectbox("Grade", [4, 5, 6, 7], label_visibility="collapsed")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            agree = st.checkbox("I agree to the Terms of Service and Privacy Policy")
            
            st.markdown("<br>", unsafe_allow_html=True)
            
            submitted = st.form_submit_button("Create Account", use_container_width=True, type="primary")
            
            if submitted:
                if not name or not email or not password:
                    st.warning("Please fill in all fields.")
                elif not agree:
                    st.warning("Please agree to the Terms of Service.")
                else:
                    success, message = register_user(name, email, password, role, grade)
                    if success:
                        st.success("Account created successfully! Please login.")
                        st.session_state.navigate("login")
                    else:
                        st.error(message)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        st.markdown('<p style="text-align: center; color: #64748B;">Already have an account?</p>', unsafe_allow_html=True)
        col_a, col_b, col_c = st.columns([1, 2, 1])
        with col_b:
            if st.button("Login", key="goto_login", use_container_width=True):
                st.session_state.navigate("login")

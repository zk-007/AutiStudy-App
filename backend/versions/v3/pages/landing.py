import streamlit as st

def render_landing():
    # Header
    col1, col2, col3, col4 = st.columns([2, 1, 1, 1])
    
    with col1:
        st.markdown('<p style="color: #2563EB; font-size: 2.5rem !important; font-weight: 800; margin: 0;">AutiStudy</p>', unsafe_allow_html=True)
    
    with col2:
        st.markdown('<p style="color: #1E3A5F; font-weight: 600; padding-top: 0.5rem;">Home</p>', unsafe_allow_html=True)
    
    with col3:
        st.markdown('<p style="color: #64748B; font-weight: 600; padding-top: 0.5rem;">About</p>', unsafe_allow_html=True)
    
    with col4:
        st.markdown('<p style="color: #64748B; font-weight: 600; padding-top: 0.5rem;">FAQ</p>', unsafe_allow_html=True)
    
    # Login/Signup buttons
    col_space, col_login, col_signup = st.columns([6, 1.5, 1.5])
    with col_login:
        if st.button("Login", key="header_login"):
            st.session_state.navigate("login")
    with col_signup:
        if st.button("Sign Up", key="header_signup", type="primary"):
            st.session_state.navigate("signup")
    
    st.markdown("---")
    
    # Hero Section
    st.markdown("""
    <div style="background: white; border-radius: 24px; padding: 3rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin: 1rem 0 2rem 0;">
    """, unsafe_allow_html=True)
    
    hero_col1, hero_col2 = st.columns([1.3, 1])
    
    with hero_col1:
        st.markdown("""
        <h1 style="color: #1E3A5F; font-size: 3rem !important; font-weight: 800; margin-bottom: 1rem; line-height: 1.3;">
            Adaptive AI Tutor for Grades 4-7
        </h1>
        <p style="color: #64748B; font-size: 1.5rem !important; margin-bottom: 2rem;">
            Learn with an intelligent chatbot
        </p>
        """, unsafe_allow_html=True)
        
        btn_col1, btn_col2, _ = st.columns([1.2, 1, 2])
        with btn_col1:
            if st.button("Get Started", key="hero_start", type="primary", use_container_width=True):
                st.session_state.navigate("signup")
        with btn_col2:
            if st.button("Login", key="hero_login", use_container_width=True):
                st.session_state.navigate("login")
    
    with hero_col2:
        st.markdown("""
        <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 10rem;">👨‍🎓🤖</div>
            <p style="color: #64748B; font-size: 1.2rem !important; margin-top: 1rem;">AI-Powered Learning for Every Student</p>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)
    
    # Features Section
    st.markdown("<br>", unsafe_allow_html=True)
    
    feat_cols = st.columns(4)
    
    features = [
        {"icon": "🤖", "title": "AI Tutor", "desc": "Personalized learning"},
        {"icon": "📚", "title": "Multimodal Learning", "desc": "Visual & text content"},
        {"icon": "📝", "title": "Practice Quizzes", "desc": "Test your knowledge"},
        {"icon": "🏆", "title": "Rewards & Badges", "desc": "Earn as you learn"}
    ]
    
    for col, feature in zip(feat_cols, features):
        with col:
            st.markdown(f"""
            <div style="background: white; border-radius: 20px; padding: 2rem; text-align: center; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 2px solid #E2E8F0; min-height: 220px;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">{feature['icon']}</div>
                <p style="color: #1E3A5F; font-weight: 700; font-size: 1.4rem !important; margin-bottom: 0.5rem;">{feature['title']}</p>
                <p style="color: #64748B; font-size: 1.2rem !important;">{feature['desc']}</p>
            </div>
            """, unsafe_allow_html=True)
    
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    # How It Works Section
    st.markdown("""
    <h2 style="text-align: center; color: #1E3A5F; font-size: 2.2rem !important; font-weight: 700; margin-bottom: 2rem;">
        How It Works
    </h2>
    """, unsafe_allow_html=True)
    
    # Using Streamlit columns for How It Works (not raw HTML)
    step_cols = st.columns(7)
    
    steps = [
        {"icon": "📝", "text": "Sign Up", "show_arrow": False},
        {"icon": "➡️", "text": "", "show_arrow": True},
        {"icon": "💬", "text": "Ask", "show_arrow": False},
        {"icon": "➡️", "text": "", "show_arrow": True},
        {"icon": "📖", "text": "Practice", "show_arrow": False},
        {"icon": "➡️", "text": "", "show_arrow": True},
        {"icon": "📊", "text": "Track Progress", "show_arrow": False}
    ]
    
    for col, step in zip(step_cols, steps):
        with col:
            if step["show_arrow"]:
                st.markdown(f"""
                <div style="text-align: center; padding-top: 2rem;">
                    <span style="font-size: 2rem; color: #2563EB;">{step['icon']}</span>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div style="text-align: center;">
                    <div style="background: #EFF6FF; padding: 1.2rem; border-radius: 16px; display: inline-block; margin-bottom: 0.75rem;">
                        <span style="font-size: 2.5rem;">{step['icon']}</span>
                    </div>
                    <p style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem !important; margin: 0;">{step['text']}</p>
                </div>
                """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("<br><br>", unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align: center; padding: 2rem; border-top: 1px solid #E2E8F0;">
        <p style="color: #2563EB; font-size: 1.2rem !important;">
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Privacy Policy</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Terms</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Contact</a>
        </p>
        <p style="color: #94A3B8; font-size: 1.1rem !important; margin-top: 1rem;">
            © 2024 AutiStudy. Made with ❤️ for students in Pakistan
        </p>
    </div>
    """, unsafe_allow_html=True)

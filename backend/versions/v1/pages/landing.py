import streamlit as st

def render_landing():
    # Header
    col1, col2, col3 = st.columns([2, 6, 2])
    with col1:
        st.markdown('<span class="logo-text">AutiStudy</span>', unsafe_allow_html=True)
    with col2:
        header_cols = st.columns(5)
        with header_cols[0]:
            if st.button("Home", key="nav_home", use_container_width=True):
                pass
        with header_cols[1]:
            if st.button("About", key="nav_about", use_container_width=True):
                pass
        with header_cols[2]:
            if st.button("FAQ", key="nav_faq", use_container_width=True):
                pass
    with col3:
        btn_cols = st.columns(2)
        with btn_cols[0]:
            if st.button("Login", key="header_login"):
                st.session_state.navigate("login")
        with btn_cols[1]:
            if st.button("Sign Up", key="header_signup", type="primary"):
                st.session_state.navigate("signup")
    
    st.markdown("<hr style='border: none; border-top: 1px solid #E2E8F0; margin: 1rem 0;'>", unsafe_allow_html=True)
    
    # Hero Section
    hero_col1, hero_col2 = st.columns([1.2, 1])
    
    with hero_col1:
        st.markdown("""
        <div style="padding: 2rem 0;">
            <h1 style="color: #1E3A5F; font-size: 2.8rem; font-weight: 800; margin-bottom: 0.5rem;">
                Adaptive AI Tutor for Grades 4-7
            </h1>
            <p style="color: #64748B; font-size: 1.3rem; margin-bottom: 2rem;">
                Learn with an intelligent chatbot designed for Pakistani students
            </p>
        </div>
        """, unsafe_allow_html=True)
        
        btn_col1, btn_col2, _ = st.columns([1, 1, 2])
        with btn_col1:
            if st.button("Get Started", key="hero_start", type="primary", use_container_width=True):
                st.session_state.navigate("signup")
        with btn_col2:
            if st.button("Login", key="hero_login", use_container_width=True):
                st.session_state.navigate("login")
    
    with hero_col2:
        st.markdown("""
        <div style="text-align: center; padding: 1rem;">
            <div style="font-size: 8rem;">👨‍🎓🤖</div>
            <p style="color: #64748B; font-size: 0.9rem;">AI-Powered Learning for Every Student</p>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Features Section
    st.markdown("""
    <div style="background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
    """, unsafe_allow_html=True)
    
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
            <div style="background: #F8FAFC; border-radius: 16px; padding: 1.5rem; text-align: center; border: 2px solid #E2E8F0;">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">{feature['icon']}</div>
                <div style="color: #1E3A5F; font-weight: 700; font-size: 1rem;">{feature['title']}</div>
                <div style="color: #64748B; font-size: 0.85rem;">{feature['desc']}</div>
            </div>
            """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # How It Works Section
    st.markdown("""
    <div style="text-align: center; padding: 2rem 0;">
        <h2 style="color: #1E3A5F; font-size: 1.8rem; font-weight: 700; margin-bottom: 2rem;">How It Works</h2>
    </div>
    """, unsafe_allow_html=True)
    
    steps_cols = st.columns(7)
    steps = [
        {"icon": "📝", "text": "Sign Up"},
        {"icon": "➡️", "text": ""},
        {"icon": "💬", "text": "Ask"},
        {"icon": "➡️", "text": ""},
        {"icon": "📖", "text": "Practice"},
        {"icon": "➡️", "text": ""},
        {"icon": "📊", "text": "Track Progress"}
    ]
    
    for col, step in zip(steps_cols, steps):
        with col:
            if step["text"]:
                st.markdown(f"""
                <div style="text-align: center;">
                    <div style="background: #EFF6FF; padding: 1rem; border-radius: 12px; display: inline-block;">
                        <span style="font-size: 1.5rem;">{step['icon']}</span>
                    </div>
                    <p style="color: #1E3A5F; font-weight: 600; margin-top: 0.5rem;">{step['text']}</p>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div style="text-align: center; padding-top: 1rem;">
                    <span style="font-size: 1.5rem; color: #CBD5E1;">{step['icon']}</span>
                </div>
                """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("<br><br>", unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align: center; padding: 2rem; border-top: 1px solid #E2E8F0;">
        <p style="color: #64748B; font-size: 0.9rem;">
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1rem;">Privacy Policy</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1rem;">Terms</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1rem;">Contact</a>
        </p>
        <p style="color: #94A3B8; font-size: 0.8rem; margin-top: 0.5rem;">
            © 2024 AutiStudy. Made with ❤️ for students in Pakistan
        </p>
    </div>
    """, unsafe_allow_html=True)

import streamlit as st

def render_landing():
    # Header Navigation Bar
    st.markdown("""
    <div style="background: white; border-radius: 0 0 20px 20px; padding: 1rem 2rem; margin-bottom: 1rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 3rem;">
                <span style="color: #2563EB; font-size: 2rem; font-weight: 800;">AutiStudy</span>
                <nav style="display: flex; gap: 2rem;">
                    <a href="#" style="color: #1E3A5F; text-decoration: none; font-weight: 600; font-size: 1.2rem;">Home</a>
                    <a href="#" style="color: #64748B; text-decoration: none; font-weight: 600; font-size: 1.2rem;">About</a>
                    <a href="#" style="color: #64748B; text-decoration: none; font-weight: 600; font-size: 1.2rem;">FAQ</a>
                </nav>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Header buttons
    col_space, col_login, col_signup = st.columns([8, 1, 1.2])
    with col_login:
        if st.button("Login", key="header_login"):
            st.session_state.navigate("login")
    with col_signup:
        if st.button("Sign Up", key="header_signup", type="primary"):
            st.session_state.navigate("signup")
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Hero Section
    st.markdown("""
    <div style="background: white; border-radius: 24px; padding: 3rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-bottom: 2rem;">
    """, unsafe_allow_html=True)
    
    hero_col1, hero_col2 = st.columns([1.3, 1])
    
    with hero_col1:
        st.markdown("""
        <div style="padding: 1rem 0;">
            <h1 style="color: #1E3A5F; font-size: 3.2rem; font-weight: 800; margin-bottom: 1rem; line-height: 1.2;">
                Adaptive AI Tutor for Grades 4-7
            </h1>
            <p style="color: #64748B; font-size: 1.5rem; margin-bottom: 2.5rem;">
                Learn with an intelligent chatbot
            </p>
        </div>
        """, unsafe_allow_html=True)
        
        btn_col1, btn_col2, btn_space = st.columns([1.2, 1, 2])
        with btn_col1:
            if st.button("Get Started", key="hero_start", type="primary", use_container_width=True):
                st.session_state.navigate("signup")
        with btn_col2:
            if st.button("Login", key="hero_login", use_container_width=True):
                st.session_state.navigate("login")
    
    with hero_col2:
        st.markdown("""
        <div style="text-align: center; padding: 1rem;">
            <img src="https://cdn-icons-png.flaticon.com/512/4712/4712109.png" 
                 style="width: 280px; height: auto;" alt="Student with Robot">
            <p style="color: #64748B; font-size: 1.1rem; margin-top: 1rem;">AI-Powered Learning for Every Student</p>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)
    
    # Features Section
    st.markdown("""
    <div style="background: white; border-radius: 24px; padding: 2.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 2rem;">
    """, unsafe_allow_html=True)
    
    feat_cols = st.columns(4)
    
    features = [
        {
            "icon": "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
            "title": "AI Tutor",
            "desc": "Personalized learning"
        },
        {
            "icon": "https://cdn-icons-png.flaticon.com/512/1041/1041916.png",
            "title": "Multimodal Learning",
            "desc": "Visual & text content"
        },
        {
            "icon": "https://cdn-icons-png.flaticon.com/512/3176/3176298.png",
            "title": "Practice Quizzes",
            "desc": "Test your knowledge"
        },
        {
            "icon": "https://cdn-icons-png.flaticon.com/512/3176/3176366.png",
            "title": "Rewards & Badges",
            "desc": "Earn as you learn"
        }
    ]
    
    for col, feature in zip(feat_cols, features):
        with col:
            st.markdown(f"""
            <div style="background: #F8FAFC; border-radius: 20px; padding: 2rem 1.5rem; text-align: center; border: 2px solid #E2E8F0; min-height: 180px;">
                <img src="{feature['icon']}" style="width: 60px; height: 60px; margin-bottom: 1rem;" alt="{feature['title']}">
                <div style="color: #1E3A5F; font-weight: 700; font-size: 1.3rem;">{feature['title']}</div>
                <div style="color: #64748B; font-size: 1.1rem; margin-top: 0.5rem;">{feature['desc']}</div>
            </div>
            """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)
    
    # How It Works Section
    st.markdown("""
    <div style="text-align: center; padding: 2rem 0;">
        <h2 style="color: #1E3A5F; font-size: 2.2rem; font-weight: 700; margin-bottom: 2.5rem;">How It Works</h2>
    </div>
    """, unsafe_allow_html=True)
    
    st.markdown("""
    <div style="background: white; border-radius: 24px; padding: 2.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div style="text-align: center; padding: 1rem;">
                <div style="background: #EFF6FF; padding: 1rem; border-radius: 16px; display: inline-block; margin-bottom: 0.75rem;">
                    <img src="https://cdn-icons-png.flaticon.com/512/1250/1250615.png" style="width: 45px; height: 45px;" alt="Sign Up">
                </div>
                <p style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem; margin: 0;">Sign Up</p>
            </div>
            
            <div style="color: #2563EB; font-size: 2rem; padding: 0 0.5rem;">→</div>
            
            <div style="text-align: center; padding: 1rem;">
                <div style="background: #EFF6FF; padding: 1rem; border-radius: 16px; display: inline-block; margin-bottom: 0.75rem;">
                    <img src="https://cdn-icons-png.flaticon.com/512/1041/1041916.png" style="width: 45px; height: 45px;" alt="Ask">
                </div>
                <p style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem; margin: 0;">Ask</p>
            </div>
            
            <div style="color: #2563EB; font-size: 2rem; padding: 0 0.5rem;">→</div>
            
            <div style="text-align: center; padding: 1rem;">
                <div style="background: #EFF6FF; padding: 1rem; border-radius: 16px; display: inline-block; margin-bottom: 0.75rem;">
                    <img src="https://cdn-icons-png.flaticon.com/512/3176/3176298.png" style="width: 45px; height: 45px;" alt="Practice">
                </div>
                <p style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem; margin: 0;">Practice</p>
            </div>
            
            <div style="color: #2563EB; font-size: 2rem; padding: 0 0.5rem;">→</div>
            
            <div style="text-align: center; padding: 1rem;">
                <div style="background: #EFF6FF; padding: 1rem; border-radius: 16px; display: inline-block; margin-bottom: 0.75rem;">
                    <img src="https://cdn-icons-png.flaticon.com/512/3176/3176286.png" style="width: 45px; height: 45px;" alt="Track Progress">
                </div>
                <p style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem; margin: 0;">Track Progress</p>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("<br><br>", unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align: center; padding: 2rem; border-top: 1px solid #E2E8F0;">
        <p style="color: #64748B; font-size: 1.1rem;">
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Privacy Policy</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Terms</a> | 
            <a href="#" style="color: #2563EB; text-decoration: none; margin: 0 1.5rem; font-weight: 600;">Contact</a>
        </p>
        <p style="color: #94A3B8; font-size: 1rem; margin-top: 1rem;">
            © 2024 AutiStudy. Made with ❤️ for students in Pakistan
        </p>
    </div>
    """, unsafe_allow_html=True)

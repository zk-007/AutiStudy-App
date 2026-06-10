import streamlit as st
from utils.auth import logout

def render_dashboard():
    user = st.session_state.user
    
    # Sidebar
    with st.sidebar:
        # User Profile Card
        first_letter = user.get("name", "S")[0].upper()
        st.markdown(f"""
        <div style="background: white; border-radius: 20px; padding: 2rem; margin-bottom: 1.5rem; text-align: center;">
            <div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); 
                display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: white; font-size: 2.5rem; font-weight: 700;">
                {first_letter}
            </div>
            <p style="color: #1E3A5F; margin: 0; font-weight: 700; font-size: 1.5rem !important;">{user.get('name', 'Student')}</p>
            <p style="color: #2563EB; margin: 0.5rem 0; font-size: 1.2rem !important;">Grade {user.get('grade', 4)}</p>
            <div style="background: linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%); color: white; 
                padding: 0.75rem 1.5rem; border-radius: 25px; margin-top: 1rem; font-weight: 700; font-size: 1.2rem !important;">
                ⭐ {user.get('stars', 0)} stars
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        # Navigation
        if st.button("🤖 AI Tutor", key="nav_ai_tutor", use_container_width=True, type="primary"):
            st.session_state.navigate("ai_tutor")
        
        if st.button("📝 Practice", key="nav_practice", use_container_width=True):
            st.info("Coming soon!")
        
        if st.button("📊 Analytics", key="nav_analytics", use_container_width=True):
            st.info("Coming soon!")
        
        if st.button("🏆 Rewards", key="nav_rewards", use_container_width=True):
            st.info("Coming soon!")
        
        if st.button("⚙️ Settings", key="nav_settings", use_container_width=True):
            st.info("Coming soon!")
        
        st.markdown("<br><br>", unsafe_allow_html=True)
        
        if st.button("🚪 Logout", key="nav_logout", use_container_width=True):
            logout()
            st.session_state.navigate("landing")
    
    # Main Content
    st.markdown(f"""
    <h1 style="color: #1E3A5F; font-weight: 800; font-size: 2.8rem !important; margin-bottom: 2rem;">
        Welcome back, {user.get('name', 'Student')}! 👋
    </h1>
    """, unsafe_allow_html=True)
    
    # Quick Actions
    st.markdown('<h3 style="color: #1E3A5F; font-weight: 700; font-size: 1.8rem !important; margin-bottom: 1.5rem;">Quick Actions</h3>', unsafe_allow_html=True)
    
    col1, col2, col3, col4 = st.columns(4)
    
    cards = [
        {"icon": "🤖", "title": "Chat with Tutor", "desc": "Ask any question", "color": "#2563EB", "key": "quick_chat", "action": "ai_tutor"},
        {"icon": "📝", "title": "Practice & Quiz", "desc": "Test your knowledge", "color": "#10B981", "key": "quick_practice", "action": None},
        {"icon": "📊", "title": "Learning Analytics", "desc": "Track your progress", "color": "#8B5CF6", "key": "quick_analytics", "action": None},
        {"icon": "🏆", "title": "Earn Rewards", "desc": "Collect badges", "color": "#F59E0B", "key": "quick_rewards", "action": None}
    ]
    
    for col, card in zip([col1, col2, col3, col4], cards):
        with col:
            st.markdown(f"""
            <div style="background: {card['color']}; border-radius: 20px; padding: 2rem; text-align: center; color: white; min-height: 200px;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">{card['icon']}</div>
                <p style="font-weight: 700; font-size: 1.4rem !important; margin-bottom: 0.5rem;">{card['title']}</p>
                <p style="font-size: 1.2rem !important; opacity: 0.9;">{card['desc']}</p>
            </div>
            """, unsafe_allow_html=True)
            if st.button(f"Open", key=card['key'], use_container_width=True):
                if card['action']:
                    st.session_state.navigate(card['action'])
                else:
                    st.info("Coming soon!")
    
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    # Your Subjects Section
    col_main, col_side = st.columns([2, 1])
    
    with col_main:
        st.markdown("""
        <div style="background: white; border-radius: 24px; padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h3 style="color: #1E3A5F; font-weight: 700; font-size: 1.6rem !important; margin-bottom: 1.5rem;">Your Subjects</h3>
        </div>
        """, unsafe_allow_html=True)
        
        grade = user.get("grade", 4)
        
        from utils.rag import GRADE_SUBJECTS
        subjects = GRADE_SUBJECTS.get(grade, ["Maths", "General Science"])
        
        subject_icons = {"Maths": "🔢", "General Science": "🔬", "Computer": "💻"}
        
        sub_cols = st.columns(len(subjects))
        for col, subject in zip(sub_cols, subjects):
            with col:
                icon = subject_icons.get(subject, "📚")
                st.markdown(f"""
                <div style="background: #F8FAFC; border-radius: 20px; padding: 2rem; text-align: center; border: 2px solid #E2E8F0;">
                    <div style="font-size: 5rem; margin-bottom: 1rem;">{icon}</div>
                    <p style="color: #1E3A5F; font-weight: 700; font-size: 1.5rem !important;">{subject}</p>
                    <p style="color: #64748B; font-size: 1.2rem !important;">Grade {grade}</p>
                </div>
                """, unsafe_allow_html=True)
                if st.button(f"Study {subject}", key=f"study_{subject}", use_container_width=True):
                    st.session_state.selected_grade = grade
                    st.session_state.selected_subject = subject
                    st.session_state.navigate("chat")
    
    with col_side:
        st.markdown(f"""
        <div style="background: white; border-radius: 24px; padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h3 style="color: #1E3A5F; font-weight: 700; font-size: 1.6rem !important; margin-bottom: 1.5rem;">Your Rewards</h3>
            <div style="text-align: center;">
                <p style="font-size: 3rem !important; color: #F59E0B; font-weight: 800; margin: 0;">{user.get('stars', 0)} ⭐</p>
                <p style="color: #64748B; font-size: 1.2rem !important;">stars earned</p>
            </div>
            <div style="display: flex; gap: 0.75rem; justify-content: center; margin: 1.5rem 0; flex-wrap: wrap;">
                <span style="font-size: 3rem;">🏅</span>
                <span style="font-size: 3rem;">🎯</span>
                <span style="font-size: 3rem;">⭐</span>
                <span style="font-size: 3rem;">🌟</span>
            </div>
            <p style="text-align: center; color: #64748B; font-size: 1.2rem !important;">
                Keep learning to earn more rewards!
            </p>
        </div>
        """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("""
    <p style="text-align: center; padding: 1.5rem; border-top: 1px solid #E2E8F0; color: #94A3B8; font-size: 1.1rem !important;">
        By using our services, you agree to our <a href="#" style="color: #2563EB;">Privacy Policy</a> and <a href="#" style="color: #2563EB;">Terms of Service</a>.
    </p>
    """, unsafe_allow_html=True)

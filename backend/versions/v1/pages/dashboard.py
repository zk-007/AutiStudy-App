import streamlit as st
from utils.auth import logout

def render_dashboard():
    user = st.session_state.user
    
    # Sidebar
    with st.sidebar:
        st.markdown("""
        <div style="background: white; border-radius: 20px; padding: 1.5rem; margin-bottom: 1rem; text-align: center;">
        """, unsafe_allow_html=True)
        
        # User Avatar
        first_letter = user.get("name", "S")[0].upper()
        st.markdown(f"""
        <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); 
            display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: white; font-size: 2rem; font-weight: 700;">
            {first_letter}
        </div>
        <h3 style="color: #1E3A5F; margin: 0; font-weight: 700;">{user.get('name', 'Student')}</h3>
        <p style="color: #2563EB; margin: 0.3rem 0;">Grade {user.get('grade', 4)}</p>
        """, unsafe_allow_html=True)
        
        # Stars Badge
        st.markdown(f"""
        <div style="background: linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%); color: white; 
            padding: 0.5rem 1rem; border-radius: 20px; margin: 1rem auto; display: inline-block; font-weight: 700;">
            ⭐ {user.get('stars', 0)} stars
        </div>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
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
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1 style="color: #1E3A5F; font-weight: 800; margin: 0;">Welcome back, {user.get('name', 'Student')}! 👋</h1>
    </div>
    """, unsafe_allow_html=True)
    
    # Quick Actions
    st.markdown("""
    <h3 style="color: #1E3A5F; font-weight: 700; margin-bottom: 1rem;">Quick Actions</h3>
    """, unsafe_allow_html=True)
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 16px; padding: 1.5rem; text-align: center; color: white;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🤖</div>
            <div style="font-weight: 700; font-size: 1rem;">Chat with Tutor</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Ask any question</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Start Chat", key="quick_chat", use_container_width=True):
            st.session_state.navigate("ai_tutor")
    
    with col2:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); border-radius: 16px; padding: 1.5rem; text-align: center; color: white;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📝</div>
            <div style="font-weight: 700; font-size: 1rem;">Practice & Quiz</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Test your knowledge</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Start Practice", key="quick_practice", use_container_width=True):
            st.info("Coming soon!")
    
    with col3:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); border-radius: 16px; padding: 1.5rem; text-align: center; color: white;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📊</div>
            <div style="font-weight: 700; font-size: 1rem;">Learning Analytics</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Track your progress</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("View Progress", key="quick_analytics", use_container_width=True):
            st.info("Coming soon!")
    
    with col4:
        st.markdown("""
        <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); border-radius: 16px; padding: 1.5rem; text-align: center; color: white;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏆</div>
            <div style="font-weight: 700; font-size: 1rem;">Earn Rewards</div>
            <div style="font-size: 0.85rem; opacity: 0.9;">Collect badges</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("View Rewards", key="quick_rewards", use_container_width=True):
            st.info("Coming soon!")
    
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    # Your Subjects Section
    col_main, col_side = st.columns([2, 1])
    
    with col_main:
        st.markdown("""
        <div style="background: white; border-radius: 20px; padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h3 style="color: #1E3A5F; font-weight: 700; margin-bottom: 1rem;">Your Subjects</h3>
        </div>
        """, unsafe_allow_html=True)
        
        grade = user.get("grade", 4)
        
        from utils.rag import GRADE_SUBJECTS
        subjects = GRADE_SUBJECTS.get(grade, ["Maths", "General Science"])
        
        subject_icons = {
            "Maths": "🔢",
            "General Science": "🔬",
            "Computer": "💻"
        }
        
        sub_cols = st.columns(len(subjects))
        for col, subject in zip(sub_cols, subjects):
            with col:
                icon = subject_icons.get(subject, "📚")
                st.markdown(f"""
                <div style="background: #F8FAFC; border-radius: 16px; padding: 1.5rem; text-align: center; border: 2px solid #E2E8F0;">
                    <div style="font-size: 3rem; margin-bottom: 0.5rem;">{icon}</div>
                    <div style="color: #1E3A5F; font-weight: 700; font-size: 1.1rem;">{subject}</div>
                    <div style="color: #64748B; font-size: 0.85rem;">Grade {grade}</div>
                </div>
                """, unsafe_allow_html=True)
                if st.button(f"Study {subject}", key=f"study_{subject}", use_container_width=True):
                    st.session_state.selected_grade = grade
                    st.session_state.selected_subject = subject
                    st.session_state.navigate("chat")
    
    with col_side:
        st.markdown(f"""
        <div style="background: white; border-radius: 20px; padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h3 style="color: #1E3A5F; font-weight: 700; margin-bottom: 1rem;">Your Rewards</h3>
            <div style="text-align: center;">
                <div style="font-size: 2.5rem; color: #F59E0B; font-weight: 800;">{user.get('stars', 0)} ⭐</div>
                <p style="color: #64748B; font-size: 0.9rem;">stars earned</p>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem; flex-wrap: wrap;">
                <span style="font-size: 2rem;">🏅</span>
                <span style="font-size: 2rem;">🎯</span>
                <span style="font-size: 2rem;">⭐</span>
                <span style="font-size: 2rem;">🌟</span>
            </div>
            <p style="text-align: center; color: #64748B; font-size: 0.85rem; margin-top: 1rem;">
                Keep learning to earn more rewards!
            </p>
        </div>
        """, unsafe_allow_html=True)
    
    # Footer
    st.markdown("<br><br>", unsafe_allow_html=True)
    st.markdown("""
    <div style="text-align: center; padding: 1rem; border-top: 1px solid #E2E8F0; color: #94A3B8; font-size: 0.85rem;">
        By using our services, you agree to our <a href="#" style="color: #2563EB;">Privacy Policy</a> and <a href="#" style="color: #2563EB;">Terms of Service</a>.
    </div>
    """, unsafe_allow_html=True)

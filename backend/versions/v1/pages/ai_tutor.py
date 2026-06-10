import streamlit as st
from utils.rag import GRADE_SUBJECTS
from utils.auth import logout

def render_ai_tutor():
    user = st.session_state.user
    
    # Sidebar
    with st.sidebar:
        st.markdown("""
        <div style="background: white; border-radius: 20px; padding: 1.5rem; margin-bottom: 1rem; text-align: center;">
        """, unsafe_allow_html=True)
        
        first_letter = user.get("name", "S")[0].upper()
        st.markdown(f"""
        <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); 
            display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: white; font-size: 2rem; font-weight: 700;">
            {first_letter}
        </div>
        <h3 style="color: #1E3A5F; margin: 0; font-weight: 700;">{user.get('name', 'Student')}</h3>
        <p style="color: #2563EB; margin: 0.3rem 0;">Grade {user.get('grade', 4)}</p>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
        if st.button("🏠 Dashboard", key="nav_dashboard", use_container_width=True):
            st.session_state.navigate("dashboard")
        
        if st.button("🤖 AI Tutor", key="nav_ai_tutor", use_container_width=True, type="primary"):
            pass
        
        st.markdown("<br><br>", unsafe_allow_html=True)
        
        if st.button("🚪 Logout", key="nav_logout", use_container_width=True):
            logout()
            st.session_state.navigate("landing")
    
    # Main Content
    st.markdown("""
    <div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="color: #1E3A5F; font-weight: 800;">🤖 AI Tutor</h1>
        <p style="color: #64748B; font-size: 1.1rem;">Select your grade and subject to start learning!</p>
    </div>
    """, unsafe_allow_html=True)
    
    # Step 1: Grade Selection
    st.markdown("""
    <div style="background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 2rem;">
        <h3 style="color: #1E3A5F; font-weight: 700; margin-bottom: 1.5rem;">Step 1: Select Your Grade</h3>
    </div>
    """, unsafe_allow_html=True)
    
    grade_cols = st.columns(4)
    grades = [4, 5, 6, 7]
    
    for col, grade in zip(grade_cols, grades):
        with col:
            is_selected = st.session_state.selected_grade == grade
            border_color = "#2563EB" if is_selected else "#E2E8F0"
            bg_color = "linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)" if is_selected else "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
            
            st.markdown(f"""
            <div style="background: {bg_color}; border-radius: 16px; padding: 1.5rem; text-align: center; 
                border: 3px solid {border_color}; cursor: pointer; transition: all 0.3s;">
                <div style="font-size: 2.5rem; font-weight: 800; color: #2563EB;">{grade}</div>
                <div style="color: #1E3A5F; font-weight: 600;">Grade {grade}</div>
            </div>
            """, unsafe_allow_html=True)
            
            if st.button(f"Select Grade {grade}", key=f"grade_{grade}", use_container_width=True):
                st.session_state.selected_grade = grade
                st.session_state.selected_subject = None
                st.rerun()
    
    # Step 2: Subject Selection (only shown if grade is selected)
    if st.session_state.selected_grade:
        st.markdown("<br>", unsafe_allow_html=True)
        
        st.markdown(f"""
        <div style="background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 2rem;">
            <h3 style="color: #1E3A5F; font-weight: 700; margin-bottom: 1.5rem;">
                Step 2: Select Your Subject (Grade {st.session_state.selected_grade})
            </h3>
        </div>
        """, unsafe_allow_html=True)
        
        subjects = GRADE_SUBJECTS.get(st.session_state.selected_grade, [])
        
        subject_icons = {
            "Maths": "🔢",
            "General Science": "🔬",
            "Computer": "💻"
        }
        
        subject_colors = {
            "Maths": ("#3B82F6", "#2563EB"),
            "General Science": ("#10B981", "#059669"),
            "Computer": ("#8B5CF6", "#7C3AED")
        }
        
        subject_cols = st.columns(len(subjects))
        
        for col, subject in zip(subject_cols, subjects):
            with col:
                icon = subject_icons.get(subject, "📚")
                colors = subject_colors.get(subject, ("#3B82F6", "#2563EB"))
                is_selected = st.session_state.selected_subject == subject
                border_color = colors[1] if is_selected else "#E2E8F0"
                
                st.markdown(f"""
                <div style="background: white; border-radius: 16px; padding: 2rem; text-align: center; 
                    border: 3px solid {border_color}; cursor: pointer; transition: all 0.3s;">
                    <div style="font-size: 4rem; margin-bottom: 0.5rem;">{icon}</div>
                    <div style="color: #1E3A5F; font-weight: 700; font-size: 1.2rem;">{subject}</div>
                </div>
                """, unsafe_allow_html=True)
                
                if st.button(f"Select {subject}", key=f"subject_{subject}", use_container_width=True):
                    st.session_state.selected_subject = subject
                    st.rerun()
    
    # Step 3: Start Learning (only shown if both grade and subject are selected)
    if st.session_state.selected_grade and st.session_state.selected_subject:
        st.markdown("<br>", unsafe_allow_html=True)
        
        st.markdown(f"""
        <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 20px; padding: 2rem; text-align: center; color: white;">
            <h3 style="font-weight: 700; margin-bottom: 0.5rem;">Ready to Learn!</h3>
            <p style="opacity: 0.9; margin-bottom: 1.5rem;">
                You selected <strong>Grade {st.session_state.selected_grade}</strong> - <strong>{st.session_state.selected_subject}</strong>
            </p>
        </div>
        """, unsafe_allow_html=True)
        
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            if st.button("🚀 Start Learning with AI Tutor", key="start_learning", use_container_width=True, type="primary"):
                st.session_state.chat_history = []
                st.session_state.navigate("chat")
    
    # Info Section
    st.markdown("<br><br>", unsafe_allow_html=True)
    
    st.markdown("""
    <div style="background: #FEF3C7; border-radius: 16px; padding: 1.5rem; border-left: 4px solid #F59E0B;">
        <h4 style="color: #92400E; margin: 0 0 0.5rem 0;">💡 Learning Tips</h4>
        <ul style="color: #92400E; margin: 0; padding-left: 1.5rem;">
            <li>Take your time - there's no rush!</li>
            <li>Ask questions if you don't understand something</li>
            <li>Practice makes perfect</li>
            <li>Earn stars for completing lessons</li>
        </ul>
    </div>
    """, unsafe_allow_html=True)

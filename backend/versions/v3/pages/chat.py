import streamlit as st
from utils.llm import generate_response
from utils.auth import logout

def render_chat():
    user = st.session_state.user
    grade = st.session_state.selected_grade or user.get("grade", 4)
    subject = st.session_state.selected_subject or "Maths"
    
    # Sidebar
    with st.sidebar:
        first_letter = user.get("name", "S")[0].upper()
        st.markdown(f"""
        <div style="background: white; border-radius: 20px; padding: 2rem; margin-bottom: 1.5rem; text-align: center;">
            <div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); 
                display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem; color: white; font-size: 2.5rem; font-weight: 700;">
                {first_letter}
            </div>
            <p style="color: #1E3A5F; margin: 0; font-weight: 700; font-size: 1.5rem !important;">{user.get('name', 'Student')}</p>
            <p style="color: #2563EB; margin: 0.5rem 0; font-size: 1.2rem !important;">Grade {grade} - {subject}</p>
        </div>
        """, unsafe_allow_html=True)
        
        if st.button("🏠 Dashboard", key="nav_dashboard", use_container_width=True):
            st.session_state.navigate("dashboard")
        
        if st.button("🤖 Change Subject", key="nav_ai_tutor", use_container_width=True):
            st.session_state.navigate("ai_tutor")
        
        if st.button("🗑️ Clear Chat", key="clear_chat", use_container_width=True):
            st.session_state.chat_history = []
            st.rerun()
        
        st.markdown("<br><br>", unsafe_allow_html=True)
        
        if st.button("🚪 Logout", key="nav_logout", use_container_width=True):
            logout()
            st.session_state.navigate("landing")
        
        # Session Info
        st.markdown(f"""
        <div style="background: #EFF6FF; border-radius: 16px; padding: 1.5rem; margin-top: 1rem;">
            <p style="color: #1E3A5F; font-weight: 700; margin: 0 0 0.75rem 0; font-size: 1.3rem !important;">Current Session</p>
            <p style="color: #64748B; font-size: 1.2rem !important; margin: 0.25rem 0;">Grade: {grade}</p>
            <p style="color: #64748B; font-size: 1.2rem !important; margin: 0.25rem 0;">Subject: {subject}</p>
        </div>
        """, unsafe_allow_html=True)
    
    # Header
    st.markdown(f"""
    <div style="display: flex; align-items: center; margin-bottom: 1.5rem;">
        <span style="font-size: 4rem; margin-right: 1.5rem;">🤖</span>
        <div>
            <h2 style="color: #1E3A5F; font-weight: 800; margin: 0; font-size: 2.4rem !important;">AI Tutor</h2>
            <p style="color: #64748B; margin: 0.25rem 0 0 0; font-size: 1.4rem !important;">Grade {grade} - {subject}</p>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Chat Container
    st.markdown("""
    <div style="background: white; border-radius: 24px; padding: 2rem; min-height: 400px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
    """, unsafe_allow_html=True)
    
    # Welcome message if no chat history
    if not st.session_state.chat_history:
        st.markdown(f"""
        <div style="background: #F1F5F9; border-radius: 20px; padding: 2rem; margin-bottom: 1rem;">
            <div style="display: flex; align-items: flex-start;">
                <span style="font-size: 3rem; margin-right: 1.5rem;">🤖</span>
                <div>
                    <p style="color: #1E3A5F; font-weight: 700; margin: 0 0 0.75rem 0; font-size: 1.5rem !important;">AutiStudy AI Tutor</p>
                    <p style="color: #475569; margin: 0; font-size: 1.3rem !important; line-height: 1.7;">
                        Assalam-o-Alaikum! I'm your AI tutor for <strong>{subject}</strong> (Grade {grade}). 
                        I'm here to help you learn and understand your lessons better! 😊
                    </p>
                    <p style="color: #475569; margin: 1rem 0 0 0; font-size: 1.3rem !important; line-height: 1.7;">
                        Ask me anything about {subject} - whether it's homework help, explaining a concept, 
                        or practicing problems. I'm patient and here to help you at your own pace!
                    </p>
                    <p style="color: #64748B; font-size: 1.2rem !important; margin: 1rem 0 0 0; font-style: italic;">
                        Try asking: "What is addition?" or "Help me with multiplication"
                    </p>
                </div>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    # Display chat history
    for message in st.session_state.chat_history:
        if message["role"] == "user":
            st.markdown(f"""
            <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 20px; 
                padding: 1.5rem 2rem; margin: 1rem 0 1rem 15%; color: white;">
                <p style="margin: 0; font-size: 1.3rem !important; line-height: 1.6;">{message["content"]}</p>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown(f"""
            <div style="background: #F1F5F9; border-radius: 20px; padding: 1.5rem 2rem; margin: 1rem 15% 1rem 0;">
                <div style="display: flex; align-items: flex-start;">
                    <span style="font-size: 2.5rem; margin-right: 1rem;">🤖</span>
                    <p style="color: #475569; margin: 0; white-space: pre-wrap; font-size: 1.3rem !important; line-height: 1.6;">{message["content"]}</p>
                </div>
            </div>
            """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)
    
    # Input Area
    st.markdown("<br>", unsafe_allow_html=True)
    
    col1, col2 = st.columns([5, 1])
    
    with col1:
        user_input = st.text_input(
            "Type your question here...",
            key="user_input",
            placeholder="Ask me anything about your subject...",
            label_visibility="collapsed"
        )
    
    with col2:
        send_button = st.button("Send 📤", key="send_message", use_container_width=True, type="primary")
    
    # Process input
    if send_button and user_input:
        st.session_state.chat_history.append({
            "role": "user",
            "content": user_input
        })
        
        with st.spinner("Thinking... 🤔"):
            response = generate_response(
                user_input,
                grade,
                subject,
                st.session_state.chat_history
            )
        
        st.session_state.chat_history.append({
            "role": "assistant",
            "content": response
        })
        
        st.rerun()
    
    # Quick Questions
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown('<p style="color: #64748B; font-size: 1.2rem !important; font-weight: 600; margin-bottom: 1rem;">Quick questions:</p>', unsafe_allow_html=True)
    
    quick_questions = {
        "Maths": ["What is addition?", "Help with multiplication", "Explain fractions", "Even and odd numbers"],
        "General Science": ["Parts of a plant?", "Solar system", "States of matter", "How do magnets work?"],
        "Computer": ["What is a computer?", "Input devices", "About the internet", "What is software?"]
    }
    
    questions = quick_questions.get(subject, quick_questions["Maths"])
    
    q_cols = st.columns(len(questions))
    for col, question in zip(q_cols, questions):
        with col:
            if st.button(question, key=f"quick_{question}", use_container_width=True):
                st.session_state.chat_history.append({
                    "role": "user",
                    "content": question
                })
                
                with st.spinner("Thinking... 🤔"):
                    response = generate_response(
                        question,
                        grade,
                        subject,
                        st.session_state.chat_history
                    )
                
                st.session_state.chat_history.append({
                    "role": "assistant",
                    "content": response
                })
                
                st.rerun()

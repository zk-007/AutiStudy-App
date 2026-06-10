import streamlit as st
from utils.llm import generate_response
from utils.auth import logout

def render_chat():
    user = st.session_state.user
    grade = st.session_state.selected_grade or user.get("grade", 4)
    subject = st.session_state.selected_subject or "Maths"
    
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
        <p style="color: #2563EB; margin: 0.3rem 0;">Grade {grade} - {subject}</p>
        </div>
        """, unsafe_allow_html=True)
        
        st.markdown("<br>", unsafe_allow_html=True)
        
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
        
        # Current Session Info
        st.markdown(f"""
        <div style="background: #EFF6FF; border-radius: 12px; padding: 1rem; margin-top: 1rem;">
            <p style="color: #1E3A5F; font-weight: 600; margin: 0 0 0.5rem 0;">Current Session</p>
            <p style="color: #64748B; font-size: 0.9rem; margin: 0;">Grade: {grade}</p>
            <p style="color: #64748B; font-size: 0.9rem; margin: 0;">Subject: {subject}</p>
        </div>
        """, unsafe_allow_html=True)
    
    # Main Chat Area
    st.markdown(f"""
    <div style="display: flex; align-items: center; margin-bottom: 1rem;">
        <div style="font-size: 2.5rem; margin-right: 1rem;">🤖</div>
        <div>
            <h2 style="color: #1E3A5F; font-weight: 800; margin: 0;">AI Tutor</h2>
            <p style="color: #64748B; margin: 0;">Grade {grade} - {subject}</p>
        </div>
    </div>
    """, unsafe_allow_html=True)
    
    # Chat Container
    chat_container = st.container()
    
    with chat_container:
        st.markdown("""
        <div style="background: white; border-radius: 20px; padding: 1.5rem; min-height: 400px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        """, unsafe_allow_html=True)
        
        # Welcome message if no chat history
        if not st.session_state.chat_history:
            st.markdown(f"""
            <div style="background: #F1F5F9; border-radius: 16px; padding: 1.5rem; margin-bottom: 1rem;">
                <div style="display: flex; align-items: flex-start;">
                    <div style="font-size: 2rem; margin-right: 1rem;">🤖</div>
                    <div>
                        <p style="color: #1E3A5F; font-weight: 600; margin: 0 0 0.5rem 0;">AutiStudy AI Tutor</p>
                        <p style="color: #475569; margin: 0;">
                            Assalam-o-Alaikum! I'm your AI tutor for <strong>{subject}</strong> (Grade {grade}). 
                            I'm here to help you learn and understand your lessons better! 😊
                        </p>
                        <p style="color: #475569; margin: 0.5rem 0 0 0;">
                            Ask me anything about {subject} - whether it's homework help, explaining a concept, 
                            or practicing problems. I'm patient and here to help you at your own pace!
                        </p>
                        <p style="color: #64748B; font-size: 0.9rem; margin: 0.5rem 0 0 0;">
                            <em>Try asking: "What is addition?" or "Help me with multiplication"</em>
                        </p>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)
        
        # Display chat history
        for message in st.session_state.chat_history:
            if message["role"] == "user":
                st.markdown(f"""
                <div style="background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); border-radius: 16px; 
                    padding: 1rem 1.5rem; margin: 0.5rem 0 0.5rem 20%; color: white;">
                    <p style="margin: 0;">{message["content"]}</p>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div style="background: #F1F5F9; border-radius: 16px; padding: 1rem 1.5rem; margin: 0.5rem 20% 0.5rem 0;">
                    <div style="display: flex; align-items: flex-start;">
                        <div style="font-size: 1.5rem; margin-right: 0.75rem;">🤖</div>
                        <div>
                            <p style="color: #475569; margin: 0; white-space: pre-wrap;">{message["content"]}</p>
                        </div>
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
    st.markdown("""
    <p style="color: #64748B; font-size: 0.9rem; margin-bottom: 0.5rem;">Quick questions:</p>
    """, unsafe_allow_html=True)
    
    quick_questions = {
        "Maths": [
            "What is addition?",
            "Help me with multiplication tables",
            "Explain fractions simply",
            "What are even and odd numbers?"
        ],
        "General Science": [
            "What are the parts of a plant?",
            "Tell me about the solar system",
            "What are the states of matter?",
            "How do magnets work?"
        ],
        "Computer": [
            "What is a computer?",
            "What are input devices?",
            "Tell me about the internet",
            "What is software?"
        ]
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

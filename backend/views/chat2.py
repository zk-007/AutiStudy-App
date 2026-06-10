import streamlit as st
from utils.llm import generate_response, generate_image
from utils.auth import logout
from utils.chat_db import get_user_chats, create_chat_session, save_message, get_chat_session

def render_chat():
    user = st.session_state.user
    grade = st.session_state.selected_grade or user.get("grade", 4)
    subject = st.session_state.selected_subject or "Maths"
    user_email = user.get("email", "guest")
    
    # Initialize chat session if not exists
    if "current_chat_id" not in st.session_state or not st.session_state.current_chat_id:
        st.session_state.current_chat_id = create_chat_session(user_email, grade, subject)
    
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    
    if "generated_images" not in st.session_state:
        st.session_state.generated_images = {}
    
    if "show_right_sidebar" not in st.session_state:
        st.session_state.show_right_sidebar = False
    
    # Left Sidebar
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
            st.session_state.current_chat_id = None
            st.session_state.chat_history = []
            st.session_state.navigate("ai_tutor")
        
        if st.button("➕ New Chat", key="new_chat", use_container_width=True):
            st.session_state.current_chat_id = create_chat_session(user_email, grade, subject)
            st.session_state.chat_history = []
            st.session_state.generated_images = {}
            st.rerun()
        
        if st.button("🗑️ Clear Chat", key="clear_chat", use_container_width=True):
            st.session_state.chat_history = []
            st.session_state.generated_images = {}
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
    
    # Main Layout with right sidebar toggle
    main_col, right_col = st.columns([4, 1])
    
    with right_col:
        # Apply purple background to the entire right column
        st.markdown("""
        <style>
        [data-testid="column"]:last-child {
            background: linear-gradient(135deg, #EDE9FE 0%, #E0E7FF 50%, #DDD6FE 100%);
            border-radius: 16px;
            padding: 1rem;
            min-height: 500px;
        }
        [data-testid="column"]:last-child .stButton > button {
            background: white !important;
            color: #5B21B6 !important;
            border: 1px solid rgba(139, 92, 246, 0.3) !important;
            font-size: 0.85rem !important;
            padding: 0.5rem !important;
        }
        [data-testid="column"]:last-child .stButton > button:hover {
            background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%) !important;
            color: white !important;
        }
        </style>
        """, unsafe_allow_html=True)
        
        # Header
        st.markdown("""
        <p style="color: #5B21B6; font-weight: 700; font-size: 1.1rem; margin: 0 0 1rem 0; text-align: center;">
            📂 Previous Chats
        </p>
        """, unsafe_allow_html=True)
        
        # Get previous chats
        previous_chats = get_user_chats(user_email)
        
        if previous_chats:
            for chat in previous_chats[:10]:  # Show last 10 chats
                chat_title = chat.get("title", "Untitled")[:20]
                chat_id = chat.get("id", "")
                
                is_current = chat_id == st.session_state.current_chat_id
                btn_type = "primary" if is_current else "secondary"
                
                if st.button(f"💬 {chat_title}", key=f"chat_{chat_id}", use_container_width=True, type=btn_type):
                    # Load this chat
                    session = get_chat_session(user_email, chat_id)
                    if session:
                        st.session_state.current_chat_id = chat_id
                        st.session_state.selected_grade = session.get("grade", grade)
                        st.session_state.selected_subject = session.get("subject", subject)
                        st.session_state.chat_history = session.get("messages", [])
                        st.session_state.generated_images = {}
                        st.rerun()
        else:
            st.markdown("""
            <p style="color: #7C3AED; font-size: 0.9rem; text-align: center; padding: 1rem;">No previous chats yet.</p>
            """, unsafe_allow_html=True)
    
    with main_col:
        # Header
        st.markdown(f"""
        <div style="display: flex; align-items: center; margin-bottom: 1.5rem;">
            <div style="font-size: 2.5rem; margin-right: 1rem;">🤖</div>
            <div>
                <h2 style="color: #1E3A5F; font-weight: 800; margin: 0;">AI Tutor</h2>
                <p style="color: #64748B; margin: 0;">Grade {grade} - {subject}</p>
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        # Instructions box (only show if no chat history)
        if not st.session_state.chat_history:
            st.markdown(f"""
            <div style="background: linear-gradient(135deg, #DBEAFE 0%, #E0E7FF 50%, #EDE9FE 100%); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid #2563EB;">
                <div style="display: flex; align-items: flex-start;">
                    <div style="font-size: 2rem; margin-right: 1rem;">💡</div>
                    <div>
                        <p style="color: #1E3A5F; font-weight: 700; margin: 0 0 0.5rem 0; font-size: 1.2rem;">How to ask questions:</p>
                        <p style="color: #475569; margin: 0; font-size: 1.1rem;">
                            I'm your AI tutor for <strong>{subject}</strong> (Grade {grade}). Ask me anything - homework help, 
                            explaining concepts, or practice problems. I'm patient and here to help! 😊
                        </p>
                        <p style="color: #64748B; font-size: 1rem; margin: 0.5rem 0 0 0;">
                            <em>Example: "What is addition?" or "Explain the solar system"</em>
                        </p>
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # Initial input area
            render_input_area(grade, subject, user_email, "initial")
            
            # Quick Questions
            render_quick_questions(grade, subject, user_email)
        
        else:
            # Display conversation with input after each response
            display_conversation_with_inputs(grade, subject, user_email)


def render_input_area(grade, subject, user_email, key_suffix):
    """Render the input area for asking questions"""
    st.markdown("""
    <p style="color: #1E3A5F; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">Ask your question:</p>
    """, unsafe_allow_html=True)
    
    col1, col2 = st.columns([5, 1])
    
    with col1:
        user_input = st.text_input(
            "Type your question here...",
            key=f"user_input_{key_suffix}",
            placeholder="Type your question here...",
            label_visibility="collapsed"
        )
    
    with col2:
        send_button = st.button("Send 📤", key=f"send_{key_suffix}", use_container_width=True, type="primary")
    
    if send_button and user_input:
        process_user_input(user_input, grade, subject, user_email)


def render_quick_questions(grade, subject, user_email):
    """Render quick question buttons"""
    st.markdown("""
    <p style="color: #64748B; font-size: 1rem; margin: 0.5rem 0;">Or try a quick question:</p>
    """, unsafe_allow_html=True)
    
    quick_questions = {
        "Maths": [
            "What is addition?",
            "Help me with multiplication",
            "Explain fractions",
            "Even and odd numbers"
        ],
        "General Science": [
            "Parts of a plant",
            "Tell me about solar system",
            "States of matter",
            "How do magnets work?"
        ],
        "Computer": [
            "What is a computer?",
            "What are input devices?",
            "Tell me about internet",
            "What is software?"
        ]
    }
    
    questions = quick_questions.get(subject, quick_questions["Maths"])
    
    q_cols = st.columns(len(questions))
    for idx, (col, question) in enumerate(zip(q_cols, questions)):
        with col:
            if st.button(question, key=f"quick_{idx}_{question}", use_container_width=True):
                process_user_input(question, grade, subject, user_email)


def process_user_input(user_input, grade, subject, user_email):
    """Process user input and generate response"""
    from utils.llm import generate_response
    
    # Add user message
    st.session_state.chat_history.append({
        "role": "user",
        "content": user_input
    })
    
    # Save to database
    save_message(user_email, st.session_state.current_chat_id, "user", user_input)
    
    # Generate response
    with st.spinner("Thinking... 🤔"):
        response = generate_response(
            user_input,
            grade,
            subject,
            st.session_state.chat_history
        )
    
    # Add assistant message
    st.session_state.chat_history.append({
        "role": "assistant",
        "content": response
    })
    
    # Save to database
    save_message(user_email, st.session_state.current_chat_id, "assistant", response)
    
    st.rerun()


def display_conversation_with_inputs(grade, subject, user_email):
    """Display conversation with input fields after each response"""
    
    messages = st.session_state.chat_history
    
    # Group messages into Q&A pairs
    i = 0
    pair_idx = 0
    
    while i < len(messages):
        msg = messages[i]
        
        if msg["role"] == "user":
            # Display user message
            with st.chat_message("user", avatar="👤"):
                st.write(msg["content"])
            
            # Check if there's a response
            if i + 1 < len(messages) and messages[i + 1]["role"] == "assistant":
                assistant_msg = messages[i + 1]
                
                # Display assistant message
                with st.chat_message("assistant", avatar="🤖"):
                    st.write(assistant_msg["content"])
                    
                    # ImageAid and VoiceAid buttons
                    st.markdown("<br>", unsafe_allow_html=True)
                    btn_col1, btn_col2, btn_col3 = st.columns([1, 1, 3])
                    
                    with btn_col1:
                        if st.button("🖼️ ImageAid", key=f"imageaid_{pair_idx}", use_container_width=True):
                            with st.spinner("Generating image... 🎨 This may take a moment..."):
                                image_url = generate_image(msg["content"], grade, subject)
                                if image_url:
                                    st.session_state.generated_images[pair_idx] = image_url
                                    st.rerun()
                                else:
                                    st.error("❌ Image generation failed. Please try again later.")
                    
                    with btn_col2:
                        if st.button("🔊 VoiceAid", key=f"voiceaid_{pair_idx}", use_container_width=True):
                            st.info("🔊 VoiceAid feature coming soon!")
                    
                    # Display generated image if exists
                    if pair_idx in st.session_state.generated_images:
                        st.markdown("<br>", unsafe_allow_html=True)
                        st.markdown("""
                        <p style="color: #2563EB; font-weight: 600; font-size: 1rem;">🖼️ Generated Image:</p>
                        """, unsafe_allow_html=True)
                        st.image(st.session_state.generated_images[pair_idx], use_container_width=True)
                
                i += 2  # Move past both user and assistant messages
                pair_idx += 1
            else:
                i += 1
        else:
            # Orphan assistant message (shouldn't happen normally)
            with st.chat_message("assistant", avatar="🤖"):
                st.write(msg["content"])
            i += 1
    
    # Divider
    st.markdown("<hr style='margin: 1.5rem 0; border: none; border-top: 1px solid #E2E8F0;'>", unsafe_allow_html=True)
    
    # Input area at the bottom for next question
    render_input_area(grade, subject, user_email, f"bottom_{len(messages)}")
    
    # Quick questions
    render_quick_questions(grade, subject, user_email)

"""
Practice Quiz Page for AutiStudy
Interactive quizzes with encouragement and analytics tracking
"""

import streamlit as st
import time
import random
from typing import List, Dict
from utils.language import t, is_urdu, get_language
from utils.llm import get_openai_client
from utils.quiz_db import save_quiz_attempt, add_stars_for_quiz


# Encouraging messages for correct answers
CORRECT_MESSAGES_EN = [
    "Excellent! You got it right! 🎉",
    "Amazing work! Keep it up! ⭐",
    "Perfect! You're doing great! 🌟",
    "Wonderful! You're so smart! 🏆",
    "Fantastic! That's correct! 👏",
    "Super! You nailed it! 💪",
    "Brilliant! Well done! 🎯",
    "Outstanding! Keep shining! ✨",
]

CORRECT_MESSAGES_UR = [
    "شاندار! آپ نے صحیح جواب دیا! 🎉",
    "بہترین! جاری رکھیں! ⭐",
    "کمال! آپ بہت اچھا کر رہے ہیں! 🌟",
    "واہ! آپ بہت ذہین ہیں! 🏆",
    "زبردست! یہ صحیح ہے! 👏",
]

# Encouraging messages for wrong answers (still positive!)
WRONG_MESSAGES_EN = [
    "Good try! Let's learn from this! 📚",
    "Almost there! Keep practicing! 💪",
    "Don't worry! Mistakes help us learn! 🌱",
    "Great effort! You're getting better! ⭐",
    "Keep going! You're doing well! 🎯",
    "Nice attempt! Learning is a journey! 🚀",
    "You're brave for trying! Keep it up! 💫",
]

WRONG_MESSAGES_UR = [
    "اچھی کوشش! آئیں اس سے سیکھیں! 📚",
    "قریب قریب! مشق جاری رکھیں! 💪",
    "فکر نہ کریں! غلطیاں سیکھنے میں مدد کرتی ہیں! 🌱",
    "شاندار کوشش! آپ بہتر ہو رہے ہیں! ⭐",
]


def _inject_css():
    st.markdown(
        """
        <style>
        .stApp {
            background: linear-gradient(135deg, #EAF2FF 0%, #F4F8FF 45%, #EDEBFF 100%);
        }

        section.main > div.block-container {
            max-width: 900px;
            padding-top: 1.5rem;
            padding-bottom: 2.5rem;
            background: rgba(255,255,255,0.7);
            border-radius: 22px;
            box-shadow: 0 12px 35px rgba(15,23,42,0.07);
        }

        .quiz-header {
            text-align: center;
            margin-bottom: 1.5rem;
        }

        .quiz-title {
            color: #0F2D4A;
            font-size: 2.2rem;
            font-weight: 900;
            margin: 0;
        }

        .quiz-subtitle {
            color: #64748B;
            font-size: 1.1rem;
            margin: 0.5rem 0 0 0;
        }

        .progress-bar-container {
            background: #E2E8F0;
            border-radius: 20px;
            height: 12px;
            margin: 1rem 0;
            overflow: hidden;
        }

        .progress-bar-fill {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            height: 100%;
            border-radius: 20px;
            transition: width 0.5s ease;
        }

        .question-card {
            background: white;
            border: 2px solid #E2E8F0;
            border-radius: 20px;
            padding: 2rem;
            margin: 1.5rem 0;
            box-shadow: 0 8px 25px rgba(15,23,42,0.06);
        }

        .question-number {
            color: #2563EB;
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }

        .question-text {
            color: #0F2D4A;
            font-size: 1.4rem;
            font-weight: 700;
            line-height: 1.5;
            margin-bottom: 1.5rem;
        }

        .timer-display {
            background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
            color: #92400E;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-weight: 700;
            display: inline-block;
            font-size: 1.1rem;
        }

        .result-card {
            background: white;
            border-radius: 24px;
            padding: 2.5rem;
            text-align: center;
            box-shadow: 0 12px 35px rgba(15,23,42,0.08);
            margin: 1rem 0;
        }

        .result-score {
            font-size: 4rem;
            font-weight: 900;
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
        }

        .result-text {
            color: #64748B;
            font-size: 1.2rem;
            margin: 0.5rem 0;
        }

        .stars-display {
            font-size: 3rem;
            margin: 1rem 0;
        }

        .celebration {
            animation: bounce 0.5s ease infinite alternate;
        }

        @keyframes bounce {
            from { transform: translateY(0); }
            to { transform: translateY(-10px); }
        }

        .feedback-correct {
            background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
            border: 2px solid #10B981;
            border-radius: 16px;
            padding: 1.2rem;
            margin: 1rem 0;
            text-align: center;
        }

        .feedback-wrong {
            background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
            border: 2px solid #F59E0B;
            border-radius: 16px;
            padding: 1.2rem;
            margin: 1rem 0;
            text-align: center;
        }

        .feedback-text {
            font-size: 1.2rem;
            font-weight: 700;
            margin: 0;
        }

        .explanation-box {
            background: #F8FAFC;
            border-left: 4px solid #2563EB;
            border-radius: 8px;
            padding: 1rem 1.2rem;
            margin-top: 1rem;
        }

        .stat-card {
            background: white;
            border-radius: 16px;
            padding: 1.2rem;
            text-align: center;
            border: 1px solid #E2E8F0;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: 800;
            color: #2563EB;
            margin: 0;
        }

        .stat-label {
            color: #64748B;
            font-size: 0.95rem;
            margin: 0.3rem 0 0 0;
        }

        .option-btn {
            width: 100%;
            padding: 1rem 1.5rem;
            margin: 0.5rem 0;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            text-align: left;
            transition: all 0.2s ease;
        }

        .rtl-text {
            direction: rtl;
            text-align: right;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def generate_quiz_questions(grade: int, subject: str, num_questions: int = 5) -> List[Dict]:
    """Generate quiz questions using GPT-4o-mini"""
    client = get_openai_client()
    if not client:
        return _get_fallback_questions(subject)
    
    language = get_language()
    lang_instruction = "Generate questions in Urdu (اردو)" if language == "ur" else "Generate questions in English"
    
    prompt = f"""Generate {num_questions} multiple choice quiz questions for a Grade {grade} student studying {subject}.
    {lang_instruction}
    
    Each question should:
    - Be appropriate for the grade level
    - Have 4 options (A, B, C, D)
    - Have exactly one correct answer
    - Include a brief, encouraging explanation
    
    Format your response as a JSON array:
    [
        {{
            "question": "Question text here?",
            "options": {{
                "A": "Option A text",
                "B": "Option B text", 
                "C": "Option C text",
                "D": "Option D text"
            }},
            "correct": "A",
            "explanation": "Brief explanation of why this is correct"
        }}
    ]
    
    Return ONLY the JSON array, no other text."""
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a friendly quiz generator for students. Generate age-appropriate educational questions."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        import json
        content = response.choices[0].message.content.strip()
        
        # Clean up the response
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        
        questions = json.loads(content)
        return questions
        
    except Exception as e:
        print(f"Error generating questions: {e}")
        return _get_fallback_questions(subject)


def _get_fallback_questions(subject: str) -> List[Dict]:
    """Fallback questions if API fails"""
    if subject == "Maths":
        return [
            {
                "question": "What is 15 + 27?",
                "options": {"A": "42", "B": "43", "C": "41", "D": "44"},
                "correct": "A",
                "explanation": "15 + 27 = 42. Great job adding two-digit numbers!"
            },
            {
                "question": "What is 8 × 7?",
                "options": {"A": "54", "B": "56", "C": "48", "D": "63"},
                "correct": "B",
                "explanation": "8 × 7 = 56. Remember your multiplication tables!"
            },
            {
                "question": "Which number is greater: 456 or 465?",
                "options": {"A": "456", "B": "465", "C": "They are equal", "D": "Cannot tell"},
                "correct": "B",
                "explanation": "465 is greater because it has 6 tens while 456 has 5 tens."
            },
            {
                "question": "What is 100 - 37?",
                "options": {"A": "63", "B": "73", "C": "67", "D": "53"},
                "correct": "A",
                "explanation": "100 - 37 = 63. You can borrow from 100 to subtract!"
            },
            {
                "question": "How many sides does a triangle have?",
                "options": {"A": "2", "B": "3", "C": "4", "D": "5"},
                "correct": "B",
                "explanation": "A triangle has 3 sides. 'Tri' means three!"
            }
        ]
    elif subject == "General Science":
        return [
            {
                "question": "What do plants need to make their own food?",
                "options": {"A": "Only water", "B": "Sunlight, water, and air", "C": "Only sunlight", "D": "Soil only"},
                "correct": "B",
                "explanation": "Plants need sunlight, water, and carbon dioxide from air to make food through photosynthesis!"
            },
            {
                "question": "What is the largest organ in the human body?",
                "options": {"A": "Heart", "B": "Brain", "C": "Skin", "D": "Liver"},
                "correct": "C",
                "explanation": "The skin is the largest organ! It protects our body from germs."
            },
            {
                "question": "Which planet is known as the Red Planet?",
                "options": {"A": "Venus", "B": "Jupiter", "C": "Mars", "D": "Saturn"},
                "correct": "C",
                "explanation": "Mars is called the Red Planet because of its reddish appearance!"
            },
            {
                "question": "What state of matter is water when it becomes ice?",
                "options": {"A": "Liquid", "B": "Gas", "C": "Solid", "D": "Plasma"},
                "correct": "C",
                "explanation": "When water freezes, it becomes ice which is a solid!"
            },
            {
                "question": "What gives leaves their green color?",
                "options": {"A": "Oxygen", "B": "Chlorophyll", "C": "Water", "D": "Sunlight"},
                "correct": "B",
                "explanation": "Chlorophyll is the green pigment in leaves that helps plants make food!"
            }
        ]
    else:  # Computer
        return [
            {
                "question": "What is the brain of a computer called?",
                "options": {"A": "Monitor", "B": "Keyboard", "C": "CPU", "D": "Mouse"},
                "correct": "C",
                "explanation": "The CPU (Central Processing Unit) is the brain of the computer that processes all information!"
            },
            {
                "question": "Which device is used to type on a computer?",
                "options": {"A": "Mouse", "B": "Monitor", "C": "Keyboard", "D": "Speaker"},
                "correct": "C",
                "explanation": "The keyboard is used for typing letters, numbers, and symbols!"
            },
            {
                "question": "What does RAM stand for?",
                "options": {"A": "Random Access Memory", "B": "Read All Memory", "C": "Run Any Machine", "D": "Really Awesome Machine"},
                "correct": "A",
                "explanation": "RAM stands for Random Access Memory - it's the computer's short-term memory!"
            },
            {
                "question": "What is the Internet?",
                "options": {"A": "A type of computer", "B": "A global network of computers", "C": "A software program", "D": "A keyboard"},
                "correct": "B",
                "explanation": "The Internet is a global network that connects computers all around the world!"
            },
            {
                "question": "Which is an input device?",
                "options": {"A": "Printer", "B": "Monitor", "C": "Speaker", "D": "Mouse"},
                "correct": "D",
                "explanation": "A mouse is an input device - it sends information TO the computer!"
            }
        ]


def render_practice_quiz():
    _inject_css()
    
    user = st.session_state.get("user", {})
    user_email = user.get("email", "guest")
    grade = st.session_state.get("selected_grade") or user.get("grade", 4)
    subject = st.session_state.get("selected_subject", "Maths")
    
    urdu = is_urdu()
    text_dir = "rtl-text" if urdu else ""
    
    # Initialize quiz state
    if "quiz_state" not in st.session_state:
        st.session_state.quiz_state = "setup"  # setup, active, review, complete
    if "quiz_questions" not in st.session_state:
        st.session_state.quiz_questions = []
    if "current_question" not in st.session_state:
        st.session_state.current_question = 0
    if "user_answers" not in st.session_state:
        st.session_state.user_answers = []
    if "time_per_question" not in st.session_state:
        st.session_state.time_per_question = []
    if "question_start_time" not in st.session_state:
        st.session_state.question_start_time = None
    if "quiz_start_time" not in st.session_state:
        st.session_state.quiz_start_time = None
    if "show_feedback" not in st.session_state:
        st.session_state.show_feedback = False
    if "last_answer_correct" not in st.session_state:
        st.session_state.last_answer_correct = False
    
    # Header with back button
    col1, col2, col3 = st.columns([1, 4, 1])
    with col1:
        if st.button("← Back", key="back_dash", use_container_width=True):
            # Reset quiz state
            st.session_state.quiz_state = "setup"
            st.session_state.quiz_questions = []
            st.session_state.current_question = 0
            st.session_state.user_answers = []
            st.session_state.time_per_question = []
            st.session_state.navigate("dashboard")
    
    # Quiz Setup Screen
    if st.session_state.quiz_state == "setup":
        render_quiz_setup(grade, subject, urdu, text_dir)
    
    # Active Quiz
    elif st.session_state.quiz_state == "active":
        render_active_quiz(urdu, text_dir)
    
    # Quiz Complete
    elif st.session_state.quiz_state == "complete":
        render_quiz_results(user_email, grade, subject, urdu, text_dir)


def render_quiz_setup(grade: int, subject: str, urdu: bool, text_dir: str):
    """Render the quiz setup/start screen"""
    
    title = "مشق کوئز" if urdu else "Practice Quiz"
    subtitle = f"جماعت {grade} - {subject}" if urdu else f"Grade {grade} - {subject}"
    
    st.markdown(
        f"""
        <div class="quiz-header {text_dir}">
            <h1 class="quiz-title">📝 {title}</h1>
            <p class="quiz-subtitle">{subtitle}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    
    st.markdown("---")
    
    # Subject selection
    col1, col2 = st.columns(2)
    
    with col1:
        grade_options = [4, 5, 6, 7]
        selected_grade = st.selectbox(
            "Select Grade" if not urdu else "جماعت منتخب کریں",
            grade_options,
            index=grade_options.index(grade) if grade in grade_options else 0
        )
        st.session_state.selected_grade = selected_grade
    
    with col2:
        if selected_grade in [4, 5]:
            subject_options = ["Maths", "General Science"]
        else:
            subject_options = ["Maths", "General Science", "Computer"]
        
        selected_subject = st.selectbox(
            "Select Subject" if not urdu else "مضمون منتخب کریں",
            subject_options,
            index=subject_options.index(subject) if subject in subject_options else 0
        )
        st.session_state.selected_subject = selected_subject
    
    # Number of questions
    num_questions = st.slider(
        "Number of Questions" if not urdu else "سوالات کی تعداد",
        min_value=3,
        max_value=10,
        value=5
    )
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Info cards
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.markdown(
            """
            <div class="stat-card">
                <div style="font-size:2rem;">⏱️</div>
                <p style="color:#0F2D4A; font-weight:700; margin:0.5rem 0 0 0;">No Time Limit</p>
                <p style="color:#64748B; font-size:0.9rem; margin:0;">Take your time!</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col2:
        st.markdown(
            f"""
            <div class="stat-card">
                <div style="font-size:2rem;">📊</div>
                <p style="color:#0F2D4A; font-weight:700; margin:0.5rem 0 0 0;">{num_questions} Questions</p>
                <p style="color:#64748B; font-size:0.9rem; margin:0;">Multiple choice</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col3:
        st.markdown(
            """
            <div class="stat-card">
                <div style="font-size:2rem;">⭐</div>
                <p style="color:#0F2D4A; font-weight:700; margin:0.5rem 0 0 0;">Earn Stars</p>
                <p style="color:#64748B; font-size:0.9rem; margin:0;">For every quiz!</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Start button
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        start_text = "🚀 کوئز شروع کریں" if urdu else "🚀 Start Quiz"
        if st.button(start_text, key="start_quiz", use_container_width=True, type="primary"):
            with st.spinner("Generating questions..." if not urdu else "سوالات بنائے جا رہے ہیں..."):
                questions = generate_quiz_questions(selected_grade, selected_subject, num_questions)
                st.session_state.quiz_questions = questions
                st.session_state.current_question = 0
                st.session_state.user_answers = []
                st.session_state.time_per_question = []
                st.session_state.quiz_start_time = time.time()
                st.session_state.question_start_time = time.time()
                st.session_state.quiz_state = "active"
                st.session_state.show_feedback = False
                st.rerun()


def render_active_quiz(urdu: bool, text_dir: str):
    """Render the active quiz question"""
    
    questions = st.session_state.quiz_questions
    current_idx = st.session_state.current_question
    total_questions = len(questions)
    
    if current_idx >= total_questions:
        st.session_state.quiz_state = "complete"
        st.rerun()
        return
    
    question = questions[current_idx]
    
    # Progress bar
    progress = (current_idx + 1) / total_questions * 100
    st.markdown(
        f"""
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: {progress}%;"></div>
        </div>
        <p style="text-align:center; color:#64748B; margin:0.5rem 0;">
            Question {current_idx + 1} of {total_questions}
        </p>
        """,
        unsafe_allow_html=True,
    )
    
    # Question card
    st.markdown(
        f"""
        <div class="question-card">
            <div class="question-number">Question {current_idx + 1}</div>
            <div class="question-text {text_dir}">{question['question']}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    
    # Show feedback if answer was submitted
    if st.session_state.show_feedback:
        correct_answer = question["correct"]
        user_answer = st.session_state.user_answers[-1] if st.session_state.user_answers else None
        is_correct = user_answer == correct_answer
        
        if is_correct:
            messages = CORRECT_MESSAGES_UR if urdu else CORRECT_MESSAGES_EN
            feedback_class = "feedback-correct"
            emoji = "🎉"
        else:
            messages = WRONG_MESSAGES_UR if urdu else WRONG_MESSAGES_EN
            feedback_class = "feedback-wrong"
            emoji = "💪"
        
        message = random.choice(messages)
        
        st.markdown(
            f"""
            <div class="{feedback_class}">
                <p class="feedback-text celebration">{emoji} {message}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
        
        # Show correct answer if wrong
        if not is_correct:
            correct_text = f"The correct answer is: {correct_answer}" if not urdu else f"صحیح جواب: {correct_answer}"
            st.markdown(
                f"""
                <div class="explanation-box">
                    <p style="color:#2563EB; font-weight:700; margin:0 0 0.5rem 0;">{correct_text}</p>
                    <p style="color:#475569; margin:0;">{question.get('explanation', '')}</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
        
        # Next button
        st.markdown("<br>", unsafe_allow_html=True)
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            if current_idx + 1 < total_questions:
                next_text = "اگلا سوال →" if urdu else "Next Question →"
            else:
                next_text = "نتائج دیکھیں 🏆" if urdu else "See Results 🏆"
            
            if st.button(next_text, key="next_question", use_container_width=True, type="primary"):
                st.session_state.current_question += 1
                st.session_state.question_start_time = time.time()
                st.session_state.show_feedback = False
                st.rerun()
    
    else:
        # Answer options
        options = question.get("options", {})
        
        for option_key, option_text in options.items():
            if st.button(
                f"{option_key}) {option_text}",
                key=f"option_{option_key}",
                use_container_width=True
            ):
                # Record answer and time
                time_taken = time.time() - st.session_state.question_start_time
                st.session_state.user_answers.append(option_key)
                st.session_state.time_per_question.append(time_taken)
                st.session_state.show_feedback = True
                st.session_state.last_answer_correct = (option_key == question["correct"])
                st.rerun()


def render_quiz_results(user_email: str, grade: int, subject: str, urdu: bool, text_dir: str):
    """Render the quiz completion results"""
    
    questions = st.session_state.quiz_questions
    user_answers = st.session_state.user_answers
    correct_answers = [q["correct"] for q in questions]
    time_per_q = st.session_state.time_per_question
    total_time = time.time() - st.session_state.quiz_start_time
    
    # Calculate score
    num_correct = sum(1 for a, c in zip(user_answers, correct_answers) if a == c)
    num_questions = len(questions)
    score_percent = (num_correct / num_questions * 100) if num_questions > 0 else 0
    
    # Save attempt and get stars
    attempt = save_quiz_attempt(
        user_email=user_email,
        grade=grade,
        subject=subject,
        questions=questions,
        answers=user_answers,
        correct_answers=correct_answers,
        time_per_question=time_per_q,
        total_time=total_time
    )
    
    stars_earned = add_stars_for_quiz(user_email, score_percent)
    
    # Celebration header
    if score_percent >= 80:
        celebration_emoji = "🎉🏆🌟"
        result_message = "Outstanding Performance!" if not urdu else "شاندار کارکردگی!"
    elif score_percent >= 60:
        celebration_emoji = "⭐👏💪"
        result_message = "Great Job!" if not urdu else "بہت اچھا!"
    else:
        celebration_emoji = "💪🌱📚"
        result_message = "Keep Practicing!" if not urdu else "مشق جاری رکھیں!"
    
    st.markdown(
        f"""
        <div class="result-card">
            <div class="celebration" style="font-size:4rem;">{celebration_emoji}</div>
            <h2 style="color:#0F2D4A; margin:1rem 0;">{result_message}</h2>
            <p class="result-score">{int(score_percent)}%</p>
            <p class="result-text">{num_correct} out of {num_questions} correct</p>
            <div class="stars-display">{'⭐' * stars_earned}</div>
            <p style="color:#F59E0B; font-weight:700;">+{stars_earned} Stars Earned!</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    
    # Stats cards
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.markdown(
            f"""
            <div class="stat-card">
                <p class="stat-value">{num_correct}</p>
                <p class="stat-label">Correct</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col2:
        st.markdown(
            f"""
            <div class="stat-card">
                <p class="stat-value">{num_questions - num_correct}</p>
                <p class="stat-label">Incorrect</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col3:
        avg_time = sum(time_per_q) / len(time_per_q) if time_per_q else 0
        st.markdown(
            f"""
            <div class="stat-card">
                <p class="stat-value">{avg_time:.1f}s</p>
                <p class="stat-label">Avg Time</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col4:
        total_mins = total_time / 60
        st.markdown(
            f"""
            <div class="stat-card">
                <p class="stat-value">{total_mins:.1f}m</p>
                <p class="stat-label">Total Time</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Action buttons
    col1, col2, col3 = st.columns(3)
    
    with col1:
        if st.button("🔄 Try Again", key="retry_quiz", use_container_width=True):
            st.session_state.quiz_state = "setup"
            st.session_state.quiz_questions = []
            st.session_state.current_question = 0
            st.session_state.user_answers = []
            st.session_state.time_per_question = []
            st.rerun()
    
    with col2:
        if st.button("📊 View Analytics", key="view_analytics", use_container_width=True):
            st.session_state.quiz_state = "setup"
            st.session_state.navigate("analytics")
    
    with col3:
        if st.button("🏠 Dashboard", key="go_dashboard", use_container_width=True):
            st.session_state.quiz_state = "setup"
            st.session_state.navigate("dashboard")
    
    # Show question review
    st.markdown("<br>", unsafe_allow_html=True)
    st.markdown("### 📋 Question Review")
    
    for i, (q, ua, ca) in enumerate(zip(questions, user_answers, correct_answers)):
        is_correct = ua == ca
        icon = "✅" if is_correct else "❌"
        
        with st.expander(f"{icon} Question {i+1}: {q['question'][:50]}..."):
            st.write(f"**Your answer:** {ua}) {q['options'].get(ua, 'N/A')}")
            st.write(f"**Correct answer:** {ca}) {q['options'].get(ca, 'N/A')}")
            st.write(f"**Time taken:** {time_per_q[i]:.1f} seconds")
            st.info(q.get("explanation", ""))

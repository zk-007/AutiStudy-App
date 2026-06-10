import streamlit as st

# Language translations
TRANSLATIONS = {
    "en": {
        # Landing Page
        "brand": "AutiStudy",
        "home": "Home",
        "about": "About",
        "faq": "FAQ",
        "login": "Login",
        "signup": "Sign Up",
        "get_started": "Get Started",
        "hero_title": "AI-Powered Learning for Every Student",
        "hero_subtitle": "Learn with an intelligent chatbot designed specifically for Pakistani students with special learning needs",
        "adaptive_tutor": "Adaptive AI Tutor for Grades 4-7",
        
        # Features
        "ai_tutor": "AI Tutor",
        "ai_tutor_desc": "Chat with our friendly AI that explains concepts in simple words",
        "personalized": "Personalized Learning",
        "personalized_desc": "Content adapted to your grade and learning pace",
        "multimodal": "Multimodal Learning",
        "multimodal_desc": "Learn with text, images, and voice assistance",
        
        # How it works
        "how_it_works": "How It Works",
        "step1": "Sign Up",
        "step1_desc": "Create your free account",
        "step2": "Ask",
        "step2_desc": "Ask any question",
        "step3": "Practice",
        "step3_desc": "Learn and practice",
        "step4": "Track Progress",
        "step4_desc": "See your improvement",
        
        # Dashboard
        "welcome": "Welcome",
        "dashboard": "Dashboard",
        "chat_with_tutor": "Chat with AI Tutor",
        "start_learning": "Start Learning",
        "your_progress": "Your Progress",
        "stars_earned": "Stars Earned",
        "quick_actions": "Quick Actions",
        
        # AI Tutor
        "select_grade": "Select Your Grade",
        "select_subject": "Select Your Subject",
        "grade": "Grade",
        "maths": "Maths",
        "general_science": "General Science",
        "computer": "Computer",
        "ready_to_learn": "Ready to Learn!",
        "you_selected": "You selected",
        "start_learning_btn": "Start Learning with AI Tutor",
        
        # Chat
        "ai_tutor_title": "AI Tutor",
        "previous_chats": "Previous Chats",
        "new_chat": "New Chat",
        "clear_chat": "Clear Chat",
        "change_subject": "Change Subject",
        "logout": "Logout",
        "current_session": "Current Session",
        "subject": "Subject",
        "ask_question": "Ask your question:",
        "type_question": "Type your question here...",
        "send": "Send",
        "quick_question": "Or try a quick question:",
        "image_aid": "ImageAid",
        "voice_aid": "VoiceAid",
        "generating_image": "Generating image...",
        "generating_voice": "Generating audio...",
        "image_failed": "Image generation failed. Please try again later.",
        "voice_failed": "Audio generation failed. Please try again later.",
        "generated_image": "Generated Image:",
        "listen_response": "Listen to Response:",
        "no_previous_chats": "No previous chats yet.",
        
        # Instructions
        "how_to_ask": "How to ask questions:",
        "tutor_intro": "I'm your AI tutor for {subject} (Grade {grade}). Ask me anything - homework help, explaining concepts, or practice problems. I'm patient and here to help!",
        "example_questions": "Example: \"What is addition?\" or \"Explain the solar system\"",
        
        # Quick Questions
        "what_is_addition": "What is addition?",
        "help_multiplication": "Help me with multiplication",
        "explain_fractions": "Explain fractions",
        "even_odd_numbers": "Even and odd numbers",
        "parts_of_plant": "Parts of a plant",
        "solar_system": "Tell me about solar system",
        "states_of_matter": "States of matter",
        "how_magnets_work": "How do magnets work?",
        "what_is_computer": "What is a computer?",
        "input_devices": "What are input devices?",
        "tell_about_internet": "Tell me about internet",
        "what_is_software": "What is software?",
        
        # Auth
        "email": "Email",
        "password": "Password",
        "enter_email": "Enter email",
        "enter_password": "Enter password",
        "name": "Full Name",
        "enter_name": "Enter name",
        "confirm_password": "Confirm Password",
        "select_role": "Select Role",
        "student": "Student",
        "teacher": "Teacher",
        "parent": "Parent",
        "login_btn": "Login",
        "signup_btn": "Sign Up",
        "no_account": "Don't have an account?",
        "have_account": "Already have an account?",
        "login_success": "Login successful!",
        "login_failed": "Invalid email or password",
        "signup_success": "Account created successfully!",
        "password_mismatch": "Passwords do not match",
        
        # Language
        "select_language": "Select Language",
        "english": "English",
        "urdu": "اردو",
        
        # Login/Signup
        "back": "Back",
        "welcome_back": "Welcome back! Please enter your details.",
        "forgot_password": "Forgot Password?",
        "create_account": "Create Account",
        "start_journey": "Start your learning journey today!",
        "agree_terms": "I agree to the Terms of Service and Privacy Policy",
        "fill_all_fields": "Please fill in all fields.",
        "agree_to_terms": "Please agree to the Terms of Service.",
        "account_created": "Account created successfully! Please login.",
        
        # Dashboard
        "welcome_back_name": "Welcome back",
        "start_chat": "Start Chat",
        "ask_any_question": "Ask any question",
        "practice_quiz": "Practice & Quiz",
        "test_knowledge": "Test your knowledge",
        "learning_analytics": "Learning Analytics",
        "track_progress": "Track your progress",
        "earn_rewards": "Earn Rewards",
        "collect_badges": "Collect badges",
        "start_practice": "Start Practice",
        "view_progress": "View Progress",
        "view_rewards": "View Rewards",
        "your_subjects": "Your Subjects",
        "your_rewards": "Your Rewards",
        "keep_learning": "Keep learning to earn more rewards!",
        "study": "Study",
        "coming_soon": "Coming soon!",
        
        # AI Tutor
        "select_grade_subject": "Select your grade and subject to start learning!",
        "step1_select_grade": "Step 1: Select Your Grade",
        "step2_select_subject": "Step 2: Select Your Subject",
        "select": "Select",
        "learning_tips": "Learning Tips",
        "tip1": "Take your time - there's no rush!",
        "tip2": "Ask questions if you don't understand something",
        "tip3": "Practice makes perfect",
        "tip4": "Earn stars for completing lessons",
    },
    
    "ur": {
        # Landing Page
        "brand": "آٹی اسٹڈی",
        "home": "ہوم",
        "about": "ہمارے بارے میں",
        "faq": "سوالات",
        "login": "لاگ ان",
        "signup": "سائن اپ",
        "get_started": "شروع کریں",
        "hero_title": "ہر طالب علم کے لیے AI سے چلنے والی تعلیم",
        "hero_subtitle": "خصوصی تعلیمی ضروریات والے پاکستانی طلباء کے لیے ڈیزائن کردہ ذہین چیٹ بوٹ سے سیکھیں",
        "adaptive_tutor": "گریڈ 4-7 کے لیے AI ٹیوٹر",
        
        # Features
        "ai_tutor": "AI ٹیوٹر",
        "ai_tutor_desc": "ہمارے دوستانہ AI سے بات کریں جو آسان الفاظ میں تصورات سمجھاتا ہے",
        "personalized": "ذاتی تعلیم",
        "personalized_desc": "آپ کی جماعت اور سیکھنے کی رفتار کے مطابق مواد",
        "multimodal": "کثیر طریقہ تعلیم",
        "multimodal_desc": "متن، تصاویر اور آواز کی مدد سے سیکھیں",
        
        # How it works
        "how_it_works": "یہ کیسے کام کرتا ہے",
        "step1": "سائن اپ",
        "step1_desc": "اپنا مفت اکاؤنٹ بنائیں",
        "step2": "پوچھیں",
        "step2_desc": "کوئی بھی سوال پوچھیں",
        "step3": "مشق",
        "step3_desc": "سیکھیں اور مشق کریں",
        "step4": "ترقی دیکھیں",
        "step4_desc": "اپنی بہتری دیکھیں",
        
        # Dashboard
        "welcome": "خوش آمدید",
        "dashboard": "ڈیش بورڈ",
        "chat_with_tutor": "AI ٹیوٹر سے بات کریں",
        "start_learning": "سیکھنا شروع کریں",
        "your_progress": "آپ کی ترقی",
        "stars_earned": "حاصل کردہ ستارے",
        "quick_actions": "فوری اقدامات",
        
        # AI Tutor
        "select_grade": "اپنی جماعت منتخب کریں",
        "select_subject": "اپنا مضمون منتخب کریں",
        "grade": "جماعت",
        "maths": "ریاضی",
        "general_science": "جنرل سائنس",
        "computer": "کمپیوٹر",
        "ready_to_learn": "سیکھنے کے لیے تیار!",
        "you_selected": "آپ نے منتخب کیا",
        "start_learning_btn": "AI ٹیوٹر کے ساتھ سیکھنا شروع کریں",
        
        # Chat
        "ai_tutor_title": "AI ٹیوٹر",
        "previous_chats": "پچھلی بات چیت",
        "new_chat": "نئی بات چیت",
        "clear_chat": "بات چیت صاف کریں",
        "change_subject": "مضمون بدلیں",
        "logout": "لاگ آؤٹ",
        "current_session": "موجودہ سیشن",
        "subject": "مضمون",
        "ask_question": "اپنا سوال پوچھیں:",
        "type_question": "یہاں اپنا سوال لکھیں...",
        "send": "بھیجیں",
        "quick_question": "یا ایک فوری سوال آزمائیں:",
        "image_aid": "تصویری مدد",
        "voice_aid": "آواز کی مدد",
        "generating_image": "تصویر بنائی جا رہی ہے...",
        "generating_voice": "آواز بنائی جا رہی ہے...",
        "image_failed": "تصویر بنانے میں ناکامی۔ براہ کرم دوبارہ کوشش کریں۔",
        "voice_failed": "آواز بنانے میں ناکامی۔ براہ کرم دوبارہ کوشش کریں۔",
        "generated_image": "بنائی گئی تصویر:",
        "listen_response": "جواب سنیں:",
        "no_previous_chats": "ابھی تک کوئی پچھلی بات چیت نہیں۔",
        
        # Instructions
        "how_to_ask": "سوالات کیسے پوچھیں:",
        "tutor_intro": "میں {subject} (جماعت {grade}) کے لیے آپ کا AI ٹیوٹر ہوں۔ مجھ سے کچھ بھی پوچھیں - ہوم ورک میں مدد، تصورات کی وضاحت، یا مشق کے سوالات۔ میں صبر سے مدد کرنے کے لیے یہاں ہوں!",
        "example_questions": "مثال: \"جمع کیا ہے؟\" یا \"نظام شمسی کی وضاحت کریں\"",
        
        # Quick Questions
        "what_is_addition": "جمع کیا ہے؟",
        "help_multiplication": "ضرب میں مدد کریں",
        "explain_fractions": "کسر کی وضاحت کریں",
        "even_odd_numbers": "زوج اور طاق نمبر",
        "parts_of_plant": "پودے کے حصے",
        "solar_system": "نظام شمسی کے بارے میں بتائیں",
        "states_of_matter": "مادے کی حالتیں",
        "how_magnets_work": "مقناطیس کیسے کام کرتے ہیں؟",
        "what_is_computer": "کمپیوٹر کیا ہے؟",
        "input_devices": "ان پٹ ڈیوائسز کیا ہیں؟",
        "tell_about_internet": "انٹرنیٹ کے بارے میں بتائیں",
        "what_is_software": "سافٹ ویئر کیا ہے؟",
        
        # Auth
        "email": "ای میل",
        "password": "پاس ورڈ",
        "enter_email": "ای میل درج کریں",
        "enter_password": "پاس ورڈ درج کریں",
        "name": "پورا نام",
        "enter_name": "نام درج کریں",
        "confirm_password": "پاس ورڈ کی تصدیق",
        "select_role": "کردار منتخب کریں",
        "student": "طالب علم",
        "teacher": "استاد",
        "parent": "والدین",
        "login_btn": "لاگ ان",
        "signup_btn": "سائن اپ",
        "no_account": "اکاؤنٹ نہیں ہے؟",
        "have_account": "پہلے سے اکاؤنٹ ہے؟",
        "login_success": "لاگ ان کامیاب!",
        "login_failed": "غلط ای میل یا پاس ورڈ",
        "signup_success": "اکاؤنٹ کامیابی سے بن گیا!",
        "password_mismatch": "پاس ورڈ مماثل نہیں ہیں",
        
        # Language
        "select_language": "زبان منتخب کریں",
        "english": "English",
        "urdu": "اردو",
        
        # Login/Signup
        "back": "واپس",
        "welcome_back": "خوش آمدید! براہ کرم اپنی تفصیلات درج کریں۔",
        "forgot_password": "پاس ورڈ بھول گئے؟",
        "create_account": "اکاؤنٹ بنائیں",
        "start_journey": "آج ہی اپنا سیکھنے کا سفر شروع کریں!",
        "agree_terms": "میں سروس کی شرائط اور رازداری کی پالیسی سے اتفاق کرتا ہوں",
        "fill_all_fields": "براہ کرم تمام فیلڈز بھریں۔",
        "agree_to_terms": "براہ کرم سروس کی شرائط سے اتفاق کریں۔",
        "account_created": "اکاؤنٹ کامیابی سے بن گیا! براہ کرم لاگ ان کریں۔",
        
        # Dashboard
        "welcome_back_name": "خوش آمدید",
        "start_chat": "بات چیت شروع کریں",
        "ask_any_question": "کوئی بھی سوال پوچھیں",
        "practice_quiz": "مشق اور کوئز",
        "test_knowledge": "اپنے علم کی جانچ کریں",
        "learning_analytics": "سیکھنے کے اعدادوشمار",
        "track_progress": "اپنی ترقی دیکھیں",
        "earn_rewards": "انعامات حاصل کریں",
        "collect_badges": "بیجز جمع کریں",
        "start_practice": "مشق شروع کریں",
        "view_progress": "ترقی دیکھیں",
        "view_rewards": "انعامات دیکھیں",
        "your_subjects": "آپ کے مضامین",
        "your_rewards": "آپ کے انعامات",
        "keep_learning": "مزید انعامات حاصل کرنے کے لیے سیکھتے رہیں!",
        "study": "پڑھیں",
        "coming_soon": "جلد آ رہا ہے!",
        
        # AI Tutor
        "select_grade_subject": "سیکھنا شروع کرنے کے لیے اپنی جماعت اور مضمون منتخب کریں!",
        "step1_select_grade": "مرحلہ 1: اپنی جماعت منتخب کریں",
        "step2_select_subject": "مرحلہ 2: اپنا مضمون منتخب کریں",
        "select": "منتخب کریں",
        "learning_tips": "سیکھنے کی تجاویز",
        "tip1": "اپنا وقت لیں - کوئی جلدی نہیں!",
        "tip2": "اگر آپ کچھ نہیں سمجھتے تو سوالات پوچھیں",
        "tip3": "مشق سے کمال آتا ہے",
        "tip4": "سبق مکمل کرنے پر ستارے حاصل کریں",
    }
}


def get_text(key: str) -> str:
    """Get translated text based on current language"""
    lang = st.session_state.get("language", "en")
    return TRANSLATIONS.get(lang, TRANSLATIONS["en"]).get(key, key)


def t(key: str) -> str:
    """Shorthand for get_text"""
    return get_text(key)


def get_language() -> str:
    """Get current language code"""
    return st.session_state.get("language", "en")


def set_language(lang: str):
    """Set the current language and save to session"""
    st.session_state.language = lang
    # Save language to persistent session if logged in
    if st.session_state.get("session_token"):
        from utils.session import update_session_language
        update_session_language(st.session_state.session_token, lang)


def is_urdu() -> bool:
    """Check if current language is Urdu"""
    return get_language() == "ur"


def get_direction() -> str:
    """Get text direction (RTL for Urdu, LTR for English)"""
    return "rtl" if is_urdu() else "ltr"

import streamlit as st
from utils.language import t, is_urdu, get_language, set_language


def _inject_css():
    st.markdown(
        """
        <style>
        .stApp {
            background: linear-gradient(135deg, #EAF2FF 0%, #F4F8FF 45%, #EDEBFF 100%);
        }

        section.main > div.block-container {
            max-width: 1100px;
            padding-top: 1.5rem;
            padding-bottom: 2.5rem;
            background: rgba(255,255,255,0.65);
            border: 1px solid rgba(148,163,184,0.18);
            border-radius: 22px;
            box-shadow: 0 12px 35px rgba(15,23,42,0.07);
            backdrop-filter: blur(10px);
        }

        .block-container {
            padding-left: 2.5rem;
            padding-right: 2.5rem;
        }

        footer, #MainMenu {
            visibility: hidden;
        }

        .about-header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .about-title {
            color: #0F2D4A;
            font-size: 2.8rem;
            font-weight: 900;
            margin: 0 0 0.5rem 0;
        }

        .about-subtitle {
            color: #64748B;
            font-size: 1.25rem;
            font-weight: 500;
            margin: 0;
        }

        .section-title {
            color: #2563EB;
            font-size: 1.6rem;
            font-weight: 800;
            margin: 2rem 0 1rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .section-content {
            color: #475569;
            font-size: 1.1rem;
            line-height: 1.8;
            margin-bottom: 1rem;
        }

        .highlight-box {
            background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
            border-left: 4px solid #2563EB;
            border-radius: 12px;
            padding: 1.2rem 1.5rem;
            margin: 1rem 0;
        }

        .highlight-box p {
            margin: 0;
            color: #1E3A5F;
            font-size: 1.1rem;
            line-height: 1.7;
        }

        .tech-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            margin: 1.5rem 0;
        }

        .tech-card {
            background: white;
            border: 1px solid rgba(148,163,184,0.22);
            border-radius: 16px;
            padding: 1.2rem;
            text-align: center;
            box-shadow: 0 4px 15px rgba(15,23,42,0.05);
            transition: transform 0.2s ease;
        }

        .tech-card:hover {
            transform: translateY(-3px);
        }

        .tech-icon {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        .tech-name {
            color: #0F2D4A;
            font-size: 1.1rem;
            font-weight: 700;
            margin: 0 0 0.3rem 0;
        }

        .tech-desc {
            color: #64748B;
            font-size: 0.95rem;
            margin: 0;
        }

        .feature-list {
            list-style: none;
            padding: 0;
            margin: 1rem 0;
        }

        .feature-list li {
            display: flex;
            align-items: flex-start;
            gap: 0.8rem;
            margin-bottom: 0.8rem;
            color: #475569;
            font-size: 1.05rem;
            line-height: 1.6;
        }

        .feature-list li::before {
            content: "✓";
            color: #10B981;
            font-weight: 800;
            font-size: 1.2rem;
        }

        .mission-box {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            border-radius: 20px;
            padding: 2rem;
            margin: 2rem 0;
            text-align: center;
            color: white;
        }

        .mission-title {
            font-size: 1.8rem;
            font-weight: 800;
            margin: 0 0 1rem 0;
        }

        .mission-text {
            font-size: 1.15rem;
            line-height: 1.7;
            margin: 0;
            opacity: 0.95;
        }

        .team-section {
            text-align: center;
            margin: 2rem 0;
        }

        .back-btn {
            margin-top: 2rem;
            text-align: center;
        }

        .bilingual-box {
            display: flex;
            gap: 1rem;
            margin: 1rem 0;
        }

        .lang-card {
            flex: 1;
            background: white;
            border: 2px solid #E2E8F0;
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
        }

        .lang-card:first-child {
            border-color: #2563EB;
        }

        .lang-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }

        .lang-name {
            color: #0F2D4A;
            font-size: 1.3rem;
            font-weight: 700;
        }

        .rtl-text {
            direction: rtl;
            text-align: right;
        }

        @media (max-width: 768px) {
            .tech-grid {
                grid-template-columns: 1fr;
            }
            .bilingual-box {
                flex-direction: column;
            }
            .about-title {
                font-size: 2.2rem;
            }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_about():
    _inject_css()

    urdu = is_urdu()
    text_dir = "rtl-text" if urdu else ""

    # Header with back button
    col1, col2, col3 = st.columns([1, 4, 1])
    with col1:
        back_label = "← واپس" if urdu else "← Back"
        if st.button(back_label, key="back_home", use_container_width=True):
            st.session_state.navigate("landing")
    with col3:
        # Language toggle
        current_lang = get_language()
        new_lang = "ur" if current_lang == "en" else "en"
        lang_label = "اردو" if current_lang == "en" else "English"
        if st.button(lang_label, key="toggle_lang", use_container_width=True):
            set_language(new_lang)
            st.rerun()

    # Page Header
    if urdu:
        st.markdown(
            """
            <div class="about-header rtl-text">
                <h1 class="about-title">آٹی اسٹڈی کے بارے میں</h1>
                <p class="about-subtitle">پاکستان کے طلباء کے لیے AI پر مبنی تعلیمی پلیٹ فارم</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="about-header">
                <h1 class="about-title">About AutiStudy</h1>
                <p class="about-subtitle">AI-Powered Adaptive Learning Platform for Students in Pakistan</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Mission Statement
    if urdu:
        st.markdown(
            """
            <div class="mission-box rtl-text">
                <h2 class="mission-title">🎯 ہمارا مشن</h2>
                <p class="mission-text">
                    ہم ہر طالب علم کے لیے معیاری تعلیم کو قابل رسائی بنانا چاہتے ہیں، خاص طور پر ان بچوں کے لیے 
                    جو آٹزم سپیکٹرم پر ہیں۔ AI کی طاقت کے ساتھ، ہم ہر بچے کی منفرد سیکھنے کی ضروریات کو پورا کرتے ہیں۔
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="mission-box">
                <h2 class="mission-title">🎯 Our Mission</h2>
                <p class="mission-text">
                    We believe every child deserves quality education tailored to their unique learning needs. 
                    AutiStudy is specifically designed for students on the autism spectrum in grades 4-7, 
                    providing patient, adaptive, and encouraging AI-powered tutoring aligned with Pakistan's national curriculum.
                </p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # What is AutiStudy
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">📚 آٹی اسٹڈی کیا ہے؟</div>
            <div class="section-content {text_dir}">
                آٹی اسٹڈی ایک جدید AI پر مبنی تعلیمی پلیٹ فارم ہے جو خاص طور پر پاکستان میں جماعت 4 سے 7 کے 
                آٹزم والے طلباء کے لیے ڈیزائن کیا گیا ہے۔ یہ پلیٹ فارم پاکستان کے قومی نصاب کے مطابق ریاضی، 
                جنرل سائنس اور کمپیوٹر کی تعلیم فراہم کرتا ہے۔
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">📚 What is AutiStudy?</div>
            <div class="section-content">
                AutiStudy is an innovative <strong>Adaptive AI Learning Platform</strong> specifically designed 
                for students with autism in grades 4-7 in Pakistan. Our platform provides personalized tutoring 
                in <strong>Mathematics</strong>, <strong>General Science</strong>, and <strong>Computer Science</strong>, 
                all aligned with Pakistan's national curriculum.
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Target Students box
    if urdu:
        st.markdown(
            f"""
            <div class="highlight-box {text_dir}">
                <p><strong>🎓 ہدف طلباء:</strong> جماعت 4، 5، 6 اور 7 میں آٹزم سپیکٹرم کے بچے</p>
                <p><strong>📍 علاقہ:</strong> خاص طور پر پاکستان کے طلباء کے لیے ڈیزائن کیا گیا</p>
                <p><strong>📖 نصاب:</strong> پاکستان کے قومی نصاب کی کتابوں سے ہم آہنگ</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="highlight-box">
                <p><strong>🎓 Target Students:</strong> Children on the autism spectrum in Grades 4, 5, 6, and 7</p>
                <p><strong>📍 Region:</strong> Designed specifically for students in Pakistan</p>
                <p><strong>📖 Curriculum:</strong> Aligned with Pakistan's National Curriculum textbooks</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Bilingual Support
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">🌐 دو زبانوں میں سپورٹ</div>
            <div class="section-content {text_dir}">
                آٹی اسٹڈی مکمل طور پر دو زبانوں میں دستیاب ہے - انگریزی اور اردو۔ طلباء اپنی پسند کی زبان میں سیکھ سکتے ہیں۔
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">🌐 Bilingual Support</div>
            <div class="section-content">
                AutiStudy is fully bilingual, supporting both <strong>English</strong> and <strong>Urdu</strong>. 
                Students can learn in their preferred language, making education more accessible and comfortable.
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown(
        """
        <div class="bilingual-box">
            <div class="lang-card">
                <div class="lang-icon">🇬🇧</div>
                <div class="lang-name">English</div>
                <p style="color:#64748B; margin:0.5rem 0 0 0;">Full interface and AI responses in English</p>
            </div>
            <div class="lang-card">
                <div class="lang-icon">🇵🇰</div>
                <div class="lang-name">اردو</div>
                <p style="color:#64748B; margin:0.5rem 0 0 0;">مکمل انٹرفیس اور AI جوابات اردو میں</p>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Technologies Used
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">🔧 ہم جو ٹیکنالوجیز استعمال کرتے ہیں</div>
            <div class="section-content {text_dir}">
                آٹی اسٹڈی جدید ترین AI اور ویب ٹیکنالوجیز کا استعمال کرتے ہوئے بنایا گیا ہے:
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            """
            <div class="tech-grid">
                <div class="tech-card">
                    <div class="tech-icon">🤖</div>
                    <div class="tech-name">OpenAI GPT-4o-mini</div>
                    <div class="tech-desc">ذہین، صبر کرنے والی تعلیمی گفتگو کے لیے جدید AI</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔍</div>
                    <div class="tech-name">RAG سسٹم</div>
                    <div class="tech-desc">نصاب پر مبنی درست جوابات کے لیے</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">📊</div>
                    <div class="tech-name">ChromaDB</div>
                    <div class="tech-desc">پاکستانی نصاب کا مواد ذخیرہ کرنے والا ڈیٹابیس</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🖼️</div>
                    <div class="tech-name">تصویر بنانا</div>
                    <div class="tech-desc">بہتر سمجھ کے لیے خودکار بصری امداد</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔊</div>
                    <div class="tech-name">آواز میں تبدیلی</div>
                    <div class="tech-desc">آڈیو پر مبنی سیکھنے کے لیے وضاحتیں سنیں</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🌐</div>
                    <div class="tech-name">Streamlit</div>
                    <div class="tech-desc">جدید، ریسپانسیو ویب انٹرفیس</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">🔧 Technologies We Use</div>
            <div class="section-content">
                AutiStudy is built using cutting-edge AI and modern web technologies to provide 
                the best learning experience:
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            """
            <div class="tech-grid">
                <div class="tech-card">
                    <div class="tech-icon">🤖</div>
                    <div class="tech-name">OpenAI GPT-4o-mini</div>
                    <div class="tech-desc">Advanced AI for intelligent, patient tutoring conversations</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔍</div>
                    <div class="tech-name">RAG System</div>
                    <div class="tech-desc">Retrieval-Augmented Generation for accurate curriculum-based answers</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">📊</div>
                    <div class="tech-name">ChromaDB</div>
                    <div class="tech-desc">Vector database storing Pakistan curriculum content</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🖼️</div>
                    <div class="tech-name">GPT Image Generation</div>
                    <div class="tech-desc">Auto-generates visual aids for better understanding</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔊</div>
                    <div class="tech-name">Text-to-Speech</div>
                    <div class="tech-desc">Listen to explanations for audio-based learning</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🌐</div>
                    <div class="tech-name">Streamlit</div>
                    <div class="tech-desc">Modern, responsive web interface</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # RAG System Details
    if urdu:
        st.markdown(
            f"""
            <div class="highlight-box {text_dir}">
                <p><strong>📖 ہمارا RAG سسٹم:</strong></p>
                <p>• <strong>ہائبرڈ تلاش:</strong> درست نتائج کے لیے سیمینٹک اور BM25 تلاش کا امتزاج</p>
                <p>• <strong>مضمون کے لحاظ سے پائپ لائنز:</strong> ریاضی، سائنس اور کمپیوٹر کے لیے مختلف بہتر پائپ لائنز</p>
                <p>• <strong>کراس انکوڈر ری رینکنگ:</strong> اعلیٰ معیار کے جوابات کے لیے نیورل ری رینکنگ</p>
                <p>• <strong>نصابی کتاب کی تصدیق:</strong> جوابات سرکاری نصاب سے آتے ہیں</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="highlight-box">
                <p><strong>📖 Our RAG (Retrieval-Augmented Generation) System:</strong></p>
                <p>• <strong>Hybrid Retrieval:</strong> Combines dense (semantic) and sparse (BM25) search for accurate results</p>
                <p>• <strong>Subject-Specific Pipelines:</strong> Different optimized pipelines for Maths, Science, and Computer</p>
                <p>• <strong>Cross-Encoder Reranking:</strong> Neural reranking for highest quality responses</p>
                <p>• <strong>Textbook Verification:</strong> Ensures answers come from official curriculum content</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Key Features
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">✨ اہم خصوصیات</div>
            """,
            unsafe_allow_html=True,
        )
        st.markdown(
            f"""
            <div class="highlight-box {text_dir}">
                <p>• آٹزم دوست مواصلاتی انداز کے ساتھ AI ٹیوٹر</p>
                <p>• صبر کے ساتھ قدم بہ قدم وضاحتیں</p>
                <p>• "کیسے" سوالات کے لیے خودکار بصری امداد</p>
                <p>• وضاحتوں کی آواز میں پلے بیک</p>
                <p>• نصاب کے مطابق مواد (جماعت 4-7)</p>
                <p>• دو زبانوں میں سپورٹ (انگریزی اور اردو)</p>
                <p>• سیاق و سباق کی گفتگو کے لیے چیٹ میموری</p>
                <p>• فوری سوالات کی تجاویز</p>
                <p>• ستاروں اور انعامات کے ساتھ پیش رفت کا سراغ</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">✨ Key Features</div>
            """,
            unsafe_allow_html=True,
        )
        col1, col2 = st.columns(2)
        with col1:
            st.markdown(
                """
                <ul class="feature-list">
                    <li>AI tutor with autism-friendly communication style</li>
                    <li>Step-by-step explanations with patience</li>
                    <li>Auto-generated visual aids for "how" questions</li>
                    <li>Voice playback of explanations</li>
                    <li>Curriculum-aligned content (Grades 4-7)</li>
                </ul>
                """,
                unsafe_allow_html=True,
            )
        with col2:
            st.markdown(
                """
                <ul class="feature-list">
                    <li>Bilingual support (English & Urdu)</li>
                    <li>Chat memory for contextual conversations</li>
                    <li>Quick question suggestions</li>
                    <li>Progress tracking with stars and rewards</li>
                    <li>Subject detection and validation</li>
                </ul>
                """,
                unsafe_allow_html=True,
            )

    # Why Autism-Friendly
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">💙 آٹزم دوست کیوں؟</div>
            <div class="section-content {text_dir}">
                آٹی اسٹڈی خاص طور پر آٹزم والے بچوں کی ضروریات کو مدنظر رکھتے ہوئے ڈیزائن کیا گیا ہے:
            </div>
            <div class="highlight-box {text_dir}">
                <p>• <strong>واضح، آسان زبان:</strong> پیچیدہ جملوں سے گریز</p>
                <p>• <strong>قدم بہ قدم نقطہ نظر:</strong> تصورات کو چھوٹے ٹکڑوں میں تقسیم کرتا ہے</p>
                <p>• <strong>بصری سیکھنا:</strong> تصورات کی وضاحت کے لیے خودکار تصاویر</p>
                <p>• <strong>صبر اور حوصلہ افزائی:</strong> کبھی جلدی نہیں، ہمیشہ معاون</p>
                <p>• <strong>پیشین گوئی انٹرفیس:</strong> مستقل، پرسکون ڈیزائن</p>
                <p>• <strong>ملٹی موڈل لرننگ:</strong> ٹیکسٹ، تصاویر اور آڈیو کے اختیارات</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">💙 Why Autism-Friendly?</div>
            <div class="section-content">
                AutiStudy is specifically designed with autism spectrum needs in mind:
            </div>
            <div class="highlight-box">
                <p>• <strong>Clear, Simple Language:</strong> Avoids complex sentences and jargon</p>
                <p>• <strong>Step-by-Step Approach:</strong> Breaks down concepts into manageable pieces</p>
                <p>• <strong>Visual Learning:</strong> Auto-generates images to explain concepts</p>
                <p>• <strong>Patience & Encouragement:</strong> Never rushes, always supportive</p>
                <p>• <strong>Predictable Interface:</strong> Consistent, calm design without overwhelming elements</p>
                <p>• <strong>Multi-Modal Learning:</strong> Text, images, and audio options</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Subjects Covered
    if urdu:
        st.markdown(
            f"""
            <div class="section-title {text_dir}">📚 شامل مضامین</div>
            <div class="tech-grid">
                <div class="tech-card">
                    <div class="tech-icon">🔢</div>
                    <div class="tech-name">ریاضی</div>
                    <div class="tech-desc">جماعت 4-7: حساب، الجبرا، جیومیٹری</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔬</div>
                    <div class="tech-name">جنرل سائنس</div>
                    <div class="tech-desc">جماعت 4-7: حیاتیات، طبیعیات، کیمیا</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">💻</div>
                    <div class="tech-name">کمپیوٹر سائنس</div>
                    <div class="tech-desc">جماعت 6-7: کمپیوٹر کی بنیادیں، سافٹ ویئر، انٹرنیٹ</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div class="section-title">📚 Subjects Covered</div>
            <div class="tech-grid">
                <div class="tech-card">
                    <div class="tech-icon">🔢</div>
                    <div class="tech-name">Mathematics</div>
                    <div class="tech-desc">Grades 4-7: Arithmetic, Algebra, Geometry, and more</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">🔬</div>
                    <div class="tech-name">General Science</div>
                    <div class="tech-desc">Grades 4-7: Biology, Physics, Chemistry basics</div>
                </div>
                <div class="tech-card">
                    <div class="tech-icon">💻</div>
                    <div class="tech-name">Computer Science</div>
                    <div class="tech-desc">Grades 6-7: Computer basics, software, internet</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    # Footer
    if urdu:
        st.markdown(
            """
            <div style="text-align:center; margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(148,163,184,0.3);">
                <div style="font-size:2rem; margin-bottom:0.5rem;">🎓</div>
                <div style="color:#2563EB; font-weight:800; font-size:1.5rem;">آٹی اسٹڈی</div>
                <div style="color:#64748B; margin-top:0.5rem;">پاکستان کے طلباء کے لیے ❤️ سے بنایا گیا</div>
                <div style="color:#94A3B8; font-size:0.9rem; margin-top:0.5rem;">© 2024 آٹی اسٹڈی۔ جملہ حقوق محفوظ ہیں۔</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            """
            <div style="text-align:center; margin-top:3rem; padding-top:2rem; border-top:1px solid rgba(148,163,184,0.3);">
                <div style="font-size:2rem; margin-bottom:0.5rem;">🎓</div>
                <div style="color:#2563EB; font-weight:800; font-size:1.5rem;">AutiStudy</div>
                <div style="color:#64748B; margin-top:0.5rem;">Made with ❤️ for students in Pakistan</div>
                <div style="color:#94A3B8; font-size:0.9rem; margin-top:0.5rem;">© 2024 AutiStudy. All rights reserved.</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

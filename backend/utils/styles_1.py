import streamlit as st

def apply_custom_styles():
    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
        
        * {
            font-family: 'Nunito', sans-serif;
        }
        
        html, body, [class*="css"] {
            font-size: 20px;
        }
        
        p, li, span, div {
            font-size: 1.25rem;
            line-height: 1.6;
        }
        
        h1, h2, h3 {
            line-height: 1.3;
        }
        
        .stApp {
            background: linear-gradient(135deg, #E8F0FE 0%, #F5F8FF 100%);
        }
        
        .main-header {
            background: white;
            padding: 1rem 2rem;
            border-radius: 0 0 20px 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            margin-bottom: 2rem;
        }
        
        .logo-text {
            color: #2563EB;
            font-size: 2.8rem;
            font-weight: 800;
        }
        
        .hero-section {
            background: white;
            border-radius: 24px;
            padding: 3rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            margin: 2rem 0;
        }
        
        .hero-title {
            color: #1E3A5F;
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 0.5rem;
        }
        
        .hero-subtitle {
            color: #64748B;
            font-size: 1.4rem;
            margin-bottom: 2rem;
        }
        
        .primary-btn {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            color: white;
            padding: 1rem 2.5rem;
            border-radius: 25px;
            border: none;
            font-weight: 600;
            font-size: 1.2rem;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .primary-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        }
        
        /* Prevent button text wrapping and ensure proper centering */
        .stButton > button {
            white-space: nowrap !important;
            min-width: fit-content !important;
            padding: 0.75rem 1.5rem !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
        }
        
        /* Ensure button content is centered */
        .stButton > button > div {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
        }
        
        /* Hero Get Started button specific */
        [data-testid="stButton"] button[kind="primary"] {
            white-space: nowrap !important;
            min-width: 180px !important;
            padding: 1rem 2rem !important;
        }
        
        .secondary-btn {
            background: white;
            color: #2563EB;
            padding: 1rem 2.5rem;
            border-radius: 25px;
            border: 2px solid #2563EB;
            font-weight: 600;
            font-size: 1.2rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .secondary-btn:hover {
            background: #EFF6FF;
        }
        
        .feature-card {
            background: white;
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            transition: transform 0.2s;
            border: 2px solid transparent;
        }
        
        .feature-card:hover {
            transform: translateY(-5px);
            border-color: #2563EB;
        }
        
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }
        
        .feature-title {
            color: #1E3A5F;
            font-weight: 700;
            font-size: 1.2rem;
        }
        
        .card {
            background: white;
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        
        .grade-card {
            background: linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%);
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            border: 3px solid transparent;
        }
        
        .grade-card:hover {
            transform: scale(1.05);
            border-color: #2563EB;
            box-shadow: 0 8px 25px rgba(37, 99, 235, 0.2);
        }
        
        .grade-card.selected {
            border-color: #2563EB;
            background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%);
        }
        
        .grade-number {
            font-size: 3rem;
            font-weight: 800;
            color: #2563EB;
        }
        
        .grade-label {
            color: #1E3A5F;
            font-weight: 600;
        }
        
        .subject-card {
            background: white;
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s;
            border: 3px solid #E2E8F0;
        }
        
        .subject-card:hover {
            border-color: #2563EB;
            transform: translateY(-3px);
        }
        
        .subject-icon {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }
        
        .subject-name {
            color: #1E3A5F;
            font-weight: 700;
            font-size: 1.3rem;
        }
        
        .sidebar-card {
            background: white;
            border-radius: 20px;
            padding: 1.5rem;
            margin-bottom: 1rem;
        }
        
        .user-avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            color: white;
            font-size: 2rem;
            font-weight: 700;
        }
        
        .user-name {
            text-align: center;
            color: #1E3A5F;
            font-weight: 700;
            font-size: 1.4rem;
        }
        
        .user-grade {
            text-align: center;
            color: #2563EB;
            font-size: 1.1rem;
        }
        
        .stars-badge {
            background: linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            margin-top: 1rem;
        }
        
        .nav-item {
            display: flex;
            align-items: center;
            padding: 0.8rem 1rem;
            border-radius: 12px;
            margin-bottom: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
            color: #64748B;
            font-weight: 600;
        }
        
        .nav-item:hover {
            background: #EFF6FF;
            color: #2563EB;
        }
        
        .nav-item.active {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            color: white;
        }
        
        .nav-icon {
            margin-right: 0.75rem;
            font-size: 1.2rem;
        }
        
        .chat-container {
            background: white;
            border-radius: 20px;
            padding: 1.5rem;
            height: 500px;
            overflow-y: auto;
        }
        
        .chat-message {
            margin-bottom: 1rem;
            padding: 1rem;
            border-radius: 16px;
        }
        
        .user-message {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            color: white;
            margin-left: 20%;
        }
        
        .bot-message {
            background: #F1F5F9;
            color: #1E3A5F;
            margin-right: 20%;
        }
        
        .input-container {
            display: flex;
            gap: 1rem;
            margin-top: 1rem;
        }
        
        .stTextInput > div > div > input {
            border-radius: 30px;
            border: 2px solid #E2E8F0;
            padding: 1rem 1.5rem;
            font-size: 1.3rem;
            min-height: 55px;
        }
        
        .stTextInput > div > div > input:focus {
            border-color: #2563EB;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        
        .stButton > button {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
            color: white !important;
            border-radius: 30px;
            padding: 1rem 2rem;
            border: none;
            font-weight: 700;
            font-size: 1.5rem;
            min-height: 65px;
            transition: all 0.2s;
        }
        
        .stButton > button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
            background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
            color: white !important;
        }
        
        .stButton > button:focus,
        .stButton > button:active {
            color: white !important;
            background: linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%) !important;
        }
        
        /* Ensure all button text states stay white */
        .stButton > button p,
        .stButton > button span,
        .stButton > button div {
            color: white !important;
        }
        
        .stButton > button:hover p,
        .stButton > button:hover span,
        .stButton > button:hover div {
            color: white !important;
        }
        
        .login-card {
            background: white;
            border-radius: 24px;
            padding: 3rem;
            box-shadow: 0 8px 30px rgba(0,0,0,0.1);
            max-width: 400px;
            margin: 2rem auto;
        }
        
        .login-title {
            color: #1E3A5F;
            font-size: 2.4rem;
            font-weight: 800;
            margin-bottom: 2rem;
        }
        
        .form-label {
            color: #1E3A5F;
            font-weight: 600;
            font-size: 1.1rem;
            margin-bottom: 0.5rem;
        }
        
        .footer {
            text-align: center;
            padding: 2rem;
            color: #64748B;
            font-size: 1rem;
        }
        
        .footer a {
            color: #2563EB;
            text-decoration: none;
        }
        
        .how-it-works {
            text-align: center;
            padding: 2rem 0;
        }
        
        .how-it-works-title {
            color: #1E3A5F;
            font-size: 1.8rem;
            font-weight: 700;
            margin-bottom: 2rem;
        }
        
        .step-item {
            display: inline-flex;
            align-items: center;
            margin: 0 1rem;
        }
        
        .step-icon {
            background: #EFF6FF;
            padding: 0.8rem;
            border-radius: 12px;
            margin-right: 0.5rem;
        }
        
        .step-text {
            color: #1E3A5F;
            font-weight: 600;
        }
        
        .step-arrow {
            color: #CBD5E1;
            margin: 0 1rem;
            font-size: 1.5rem;
        }
        
        div[data-testid="stSidebarNav"] {
            display: none;
        }
        
        /* Make sidebar wider to fit longest button text */
        section[data-testid="stSidebar"] {
            width: 320px !important;
            min-width: 320px !important;
        }
        
        section[data-testid="stSidebar"] > div {
            width: 320px !important;
            padding-left: 1rem !important;
            padding-right: 1rem !important;
        }
        
        /* Make all sidebar buttons equal width */
        section[data-testid="stSidebar"] .stButton {
            width: 100% !important;
        }
        
        section[data-testid="stSidebar"] .stButton > button {
            width: 100% !important;
            min-width: 260px !important;
        }
        
        .block-container {
            padding-top: 2rem;
            padding-left: 2rem;
            padding-right: 2rem;
        }
        
        header[data-testid="stHeader"] {
            background: transparent;
        }
        
        .stApp > header {
            background-color: transparent;
        }
        
        #MainMenu {
            visibility: hidden;
        }
        
        footer {
            visibility: hidden;
        }
        
        .stDeployButton {
            display: none;
        }
    </style>
    """, unsafe_allow_html=True)

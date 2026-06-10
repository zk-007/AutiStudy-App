import streamlit as st

def apply_custom_styles():
    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
        
        * {
            font-family: 'Nunito', sans-serif;
        }
        
        html, body, [class*="css"] {
            font-size: 20px !important;
        }
        
        .stApp {
            background: linear-gradient(135deg, #E8F0FE 0%, #F5F8FF 100%);
        }
        
        /* Hide Streamlit header/footer */
        #MainMenu {visibility: hidden;}
        header {visibility: hidden;}
        footer {visibility: hidden;}
        
        .block-container {
            padding-top: 2rem;
            padding-bottom: 2rem;
            max-width: 1200px;
        }
        
        .logo-text {
            color: #2563EB;
            font-size: 2.5rem !important;
            font-weight: 800;
        }
        
        /* All paragraph and span text */
        p, span, label, div {
            font-size: 1.2rem !important;
            line-height: 1.6 !important;
        }
        
        /* Headings */
        h1 {
            font-size: 3rem !important;
            font-weight: 800 !important;
            color: #1E3A5F !important;
        }
        
        h2 {
            font-size: 2.4rem !important;
            font-weight: 700 !important;
            color: #1E3A5F !important;
        }
        
        h3 {
            font-size: 2rem !important;
            font-weight: 700 !important;
            color: #1E3A5F !important;
        }
        
        h4 {
            font-size: 1.6rem !important;
            font-weight: 600 !important;
            color: #1E3A5F !important;
        }
        
        /* Buttons */
        .stButton > button {
            background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%) !important;
            color: white !important;
            border-radius: 30px !important;
            padding: 0.8rem 2rem !important;
            border: none !important;
            font-weight: 700 !important;
            font-size: 1.2rem !important;
            transition: all 0.2s !important;
            min-height: 50px !important;
        }
        
        .stButton > button:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4) !important;
        }
        
        /* Text inputs */
        .stTextInput > div > div > input {
            border-radius: 15px !important;
            border: 2px solid #E2E8F0 !important;
            padding: 1rem 1.5rem !important;
            font-size: 1.2rem !important;
            min-height: 55px !important;
        }
        
        .stTextInput > div > div > input:focus {
            border-color: #2563EB !important;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1) !important;
        }
        
        /* Select boxes */
        .stSelectbox > div > div {
            font-size: 1.2rem !important;
        }
        
        .stSelectbox > div > div > div {
            min-height: 55px !important;
            padding: 0.5rem 1rem !important;
            font-size: 1.2rem !important;
        }
        
        /* Checkboxes */
        .stCheckbox label {
            font-size: 1.2rem !important;
        }
        
        /* Sidebar */
        .css-1d391kg {
            padding-top: 2rem;
        }
        
        [data-testid="stSidebar"] {
            background: #F8FAFC;
            padding: 1rem;
        }
        
        [data-testid="stSidebar"] .stButton > button {
            width: 100%;
            margin-bottom: 0.5rem;
        }
        
        /* Cards */
        .feature-card {
            background: white;
            border-radius: 20px;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            border: 2px solid #E2E8F0;
            min-height: 200px;
        }
        
        .feature-card:hover {
            border-color: #2563EB;
            transform: translateY(-5px);
        }
        
        /* Step cards for How It Works */
        .step-card {
            background: #EFF6FF;
            border-radius: 16px;
            padding: 1.5rem;
            text-align: center;
        }
        
        /* Info/Warning boxes */
        .stAlert {
            font-size: 1.2rem !important;
        }
        
        /* Spinner text */
        .stSpinner > div {
            font-size: 1.2rem !important;
        }
    </style>
    """, unsafe_allow_html=True)

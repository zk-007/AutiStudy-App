import streamlit as st
import hashlib
import json
import os

USERS_FILE = "data/users.json"

def init_session_state():
    if "authenticated" not in st.session_state:
        st.session_state.authenticated = False
    if "user" not in st.session_state:
        st.session_state.user = None
    if "selected_grade" not in st.session_state:
        st.session_state.selected_grade = None
    if "selected_subject" not in st.session_state:
        st.session_state.selected_subject = None
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_users(users):
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

def register_user(name, email, password, role, grade):
    users = load_users()
    if email in users:
        return False, "Email already registered"
    
    users[email] = {
        "name": name,
        "email": email,
        "password": hash_password(password),
        "role": role,
        "grade": grade,
        "stars": 0,
        "badges": [],
        "progress": {}
    }
    save_users(users)
    return True, "Registration successful"

def authenticate_user(email, password):
    users = load_users()
    if email in users:
        if users[email]["password"] == hash_password(password):
            return True, users[email]
    return False, None

def check_authentication():
    return st.session_state.get("authenticated", False)

def logout():
    st.session_state.authenticated = False
    st.session_state.user = None
    st.session_state.selected_grade = None
    st.session_state.selected_subject = None
    st.session_state.chat_history = []

import streamlit as st
import json
import os
import hashlib
import time
from pathlib import Path
from typing import Optional, Dict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
SESSIONS_FILE = str(_PROJECT_ROOT / "data" / "sessions.json")

def generate_session_token(email: str) -> str:
    """Generate a unique session token"""
    timestamp = str(time.time())
    token_string = f"{email}:{timestamp}"
    return hashlib.sha256(token_string.encode()).hexdigest()[:32]

def load_sessions() -> Dict:
    """Load all sessions from file"""
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_sessions(sessions: Dict):
    """Save sessions to file"""
    os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
    with open(SESSIONS_FILE, 'w') as f:
        json.dump(sessions, f, indent=2)

def create_session(email: str, user_data: Dict, current_page: str = "dashboard", language: str = "en") -> str:
    """Create a new session and return the token"""
    sessions = load_sessions()
    token = generate_session_token(email)
    
    sessions[token] = {
        "email": email,
        "user_data": user_data,
        "created_at": time.time(),
        "current_page": current_page,
        "language": language
    }
    
    save_sessions(sessions)
    return token


def update_session_page(token: str, page: str):
    """Update the current page in session"""
    if not token:
        return
    sessions = load_sessions()
    if token in sessions:
        sessions[token]["current_page"] = page
        save_sessions(sessions)


def update_session_language(token: str, language: str):
    """Update the language in session"""
    if not token:
        return
    sessions = load_sessions()
    if token in sessions:
        sessions[token]["language"] = language
        save_sessions(sessions)

def get_session(token: str) -> Optional[Dict]:
    """Get session data by token"""
    if not token:
        return None
    
    sessions = load_sessions()
    session = sessions.get(token)
    
    if session:
        # Check if session is still valid (7 days)
        if time.time() - session.get("created_at", 0) < 7 * 24 * 60 * 60:
            return session
        else:
            # Session expired, remove it
            delete_session(token)
    
    return None

def delete_session(token: str):
    """Delete a session"""
    sessions = load_sessions()
    if token in sessions:
        del sessions[token]
        save_sessions(sessions)

def inject_session_storage_script():
    """Inject JavaScript to sync localStorage with URL params"""
    st.markdown("""
    <script>
    (function() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('session');
        const localToken = localStorage.getItem('autistudy_session');
        
        // If URL has token, save to localStorage
        if (urlToken) {
            localStorage.setItem('autistudy_session', urlToken);
        }
        // If localStorage has token but URL doesn't, add to URL and reload
        else if (localToken && !urlToken) {
            urlParams.set('session', localToken);
            const newUrl = window.location.pathname + '?' + urlParams.toString();
            window.location.replace(newUrl);
        }
    })();
    </script>
    """, unsafe_allow_html=True)

def set_session_cookie(token: str):
    """Set session token in browser via JavaScript and URL"""
    # Set in localStorage
    st.markdown(f"""
    <script>
    localStorage.setItem('autistudy_session', '{token}');
    </script>
    """, unsafe_allow_html=True)
    # Also set in URL query params for immediate persistence
    st.query_params["session"] = token

def clear_session_cookie():
    """Clear session token from browser"""
    st.markdown("""
    <script>
    localStorage.removeItem('autistudy_session');
    </script>
    """, unsafe_allow_html=True)
    # Clear from URL query params
    if "session" in st.query_params:
        del st.query_params["session"]

def check_persistent_session() -> Optional[Dict]:
    """Check if there's a valid persistent session"""
    try:
        # Try to get session token from query params
        params = st.query_params
        token = params.get("session", None)
        
        if token:
            session = get_session(token)
            if session:
                return session
    except:
        pass
    
    return None

def restore_session():
    """Restore user session if valid token exists"""
    session = check_persistent_session()
    
    if session:
        user_data = session.get("user_data", {})
        st.session_state.authenticated = True
        st.session_state.user = user_data
        # Restore the current page
        current_page = session.get("current_page", "dashboard")
        st.session_state.page = current_page
        # Restore the language
        language = session.get("language", "en")
        st.session_state.language = language
        # Store the token for future updates
        params = st.query_params
        st.session_state.session_token = params.get("session", None)
        return True
    
    return False

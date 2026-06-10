import json
import os
from datetime import datetime
from typing import List, Dict, Optional
import uuid

CHATS_FILE = "data/chats.json"

def load_chats() -> Dict:
    """Load all chats from file"""
    if os.path.exists(CHATS_FILE):
        with open(CHATS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_chats(chats: Dict):
    """Save chats to file"""
    os.makedirs(os.path.dirname(CHATS_FILE), exist_ok=True)
    with open(CHATS_FILE, 'w') as f:
        json.dump(chats, f, indent=2)

def get_user_chats(user_email: str, language: str = None) -> List[Dict]:
    """Get all chat sessions for a user, optionally filtered by language"""
    chats = load_chats()
    user_chats = chats.get(user_email, [])
    
    # Filter out empty sessions (no messages) - don't show them in Previous Chats
    user_chats = [c for c in user_chats if len(c.get("messages", [])) > 0]
    
    # Filter by language if specified
    if language:
        user_chats = [c for c in user_chats if c.get("language", "en") == language]
    
    # Sort by timestamp descending (newest first)
    return sorted(user_chats, key=lambda x: x.get("timestamp", ""), reverse=True)

def create_chat_session(user_email: str, grade: int, subject: str, language: str = "en") -> str:
    """Create a new chat session and return its ID"""
    chats = load_chats()
    
    if user_email not in chats:
        chats[user_email] = []
    
    chat_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now().isoformat()
    
    new_session = {
        "id": chat_id,
        "grade": grade,
        "subject": subject,
        "language": language,
        "timestamp": timestamp,
        "title": f"{subject} - {datetime.now().strftime('%b %d, %H:%M')}",
        "messages": []
    }
    
    chats[user_email].append(new_session)
    save_chats(chats)
    
    return chat_id

def save_message(user_email: str, chat_id: str, role: str, content: str, image_url: str = None, audio_base64: str = None):
    """Save a message to a chat session with optional image and audio"""
    chats = load_chats()
    
    if user_email not in chats:
        return
    
    for session in chats[user_email]:
        if session["id"] == chat_id:
            message = {
                "role": role,
                "content": content,
                "timestamp": datetime.now().isoformat()
            }
            # Add image URL if provided
            if image_url:
                message["image_url"] = image_url
            # Add audio base64 if provided
            if audio_base64:
                message["audio_base64"] = audio_base64
            
            session["messages"].append(message)
            # Update title based on first user message
            if role == "user" and len([m for m in session["messages"] if m["role"] == "user"]) == 1:
                session["title"] = content[:30] + ("..." if len(content) > 30 else "")
            break
    
    save_chats(chats)


def save_media_to_message(
    user_email: str,
    chat_id: str,
    message_index: int,
    image_url: str = None,
    audio_base64: str = None,
    math_steps: dict = None,
    emoji_counting: dict = None,
    extra: dict = None,
):
    """Attach a generated visual aid to an existing message.

    ``extra`` — arbitrary key/value pairs merged into the message dict.
    Used for new illustration types (factor_tree, fraction_bar, number_line,
    bar_chart) without needing to enumerate every field in this signature.
    """
    chats = load_chats()

    if user_email not in chats:
        return False

    for session in chats[user_email]:
        if session["id"] == chat_id:
            if 0 <= message_index < len(session["messages"]):
                msg = session["messages"][message_index]
                if image_url:
                    msg["image_url"] = image_url
                if audio_base64:
                    msg["audio_base64"] = audio_base64
                if math_steps:
                    msg["math_steps"] = math_steps
                if emoji_counting:
                    msg["emoji_counting"] = emoji_counting
                if extra and isinstance(extra, dict):
                    msg.update(extra)
                save_chats(chats)
                return True
            break

    return False

def get_chat_session(user_email: str, chat_id: str) -> Optional[Dict]:
    """Get a specific chat session"""
    chats = load_chats()
    
    if user_email not in chats:
        return None
    
    for session in chats[user_email]:
        if session["id"] == chat_id:
            return session
    
    return None

def delete_chat_session(user_email: str, chat_id: str):
    """Delete a chat session"""
    chats = load_chats()
    
    if user_email not in chats:
        return
    
    chats[user_email] = [s for s in chats[user_email] if s["id"] != chat_id]
    save_chats(chats)


def cleanup_empty_sessions():
    """Delete all chat sessions that have no messages"""
    chats = load_chats()
    total_deleted = 0
    
    for user_email in chats:
        original_count = len(chats[user_email])
        # Keep only sessions that have at least one message
        chats[user_email] = [s for s in chats[user_email] if len(s.get("messages", [])) > 0]
        deleted = original_count - len(chats[user_email])
        total_deleted += deleted
        if deleted > 0:
            print(f"Deleted {deleted} empty sessions for {user_email}")
    
    if total_deleted > 0:
        save_chats(chats)
        print(f"Total empty sessions deleted: {total_deleted}")
    else:
        print("No empty sessions found")
    
    return total_deleted

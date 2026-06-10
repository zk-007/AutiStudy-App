import os
import streamlit as st
from openai import OpenAI
from typing import List, Dict, Optional
from utils.rag import query_knowledge_base, format_context_for_prompt

def get_openai_client():
    """Get OpenAI client with API key from environment or secrets"""
    api_key = os.getenv("OPENAI_API_KEY") or st.secrets.get("OPENAI_API_KEY", "")
    if not api_key:
        return None
    return OpenAI(api_key=api_key)

SYSTEM_PROMPT = """You are AutiStudy AI Tutor, a friendly and patient educational assistant designed specifically for students with autism in grades 4-7 in Pakistan.

Your teaching style:
- Use simple, clear language appropriate for the student's grade level
- Break down complex concepts into smaller, manageable steps
- Be patient, encouraging, and supportive
- Use examples from everyday Pakistani life when possible
- Provide visual descriptions when helpful
- Repeat important points when needed
- Celebrate small achievements
- Avoid overwhelming the student with too much information at once

Current Context:
- Student Grade: {grade}
- Subject: {subject}

When answering questions:
1. First acknowledge the student's question
2. Provide a clear, step-by-step explanation
3. Use relevant examples
4. Check understanding with a simple follow-up question
5. Encourage the student

If you have reference material provided, use it to give accurate answers about the Pakistan curriculum.
If you don't have specific information, be honest but helpful.

Remember: Your goal is to make learning enjoyable and accessible!"""

def generate_response(
    user_message: str,
    grade: int,
    subject: str,
    chat_history: List[Dict],
    use_rag: bool = True
) -> str:
    """Generate a response using GPT-4 Mini with RAG"""
    
    client = get_openai_client()
    if not client:
        return "I'm sorry, but I'm not properly configured yet. Please ask your teacher to set up the API key."
    
    context = ""
    if use_rag:
        documents = query_knowledge_base(user_message, grade, subject)
        context = format_context_for_prompt(documents)
    
    system_prompt = SYSTEM_PROMPT.format(grade=grade, subject=subject)
    
    if context:
        system_prompt += f"\n\nRelevant learning material:\n{context}"
    
    messages = [{"role": "system", "content": system_prompt}]
    
    for msg in chat_history[-10:]:
        messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    messages.append({"role": "user", "content": user_message})
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"I'm having trouble thinking right now. Let's try again! (Error: {str(e)})"

def generate_quiz_question(grade: int, subject: str, topic: Optional[str] = None) -> Dict:
    """Generate a quiz question for practice"""
    
    client = get_openai_client()
    if not client:
        return None
    
    prompt = f"""Generate a simple multiple-choice quiz question for a Grade {grade} student studying {subject} in Pakistan.
    {"Topic: " + topic if topic else ""}
    
    Format your response as:
    Question: [Your question here]
    A) [Option A]
    B) [Option B]
    C) [Option C]
    D) [Option D]
    Correct: [A/B/C/D]
    Explanation: [Brief, encouraging explanation]
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a friendly quiz master for students with autism. Keep questions simple and clear."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=500
        )
        
        content = response.choices[0].message.content
        return {"raw": content}
    except Exception as e:
        return None

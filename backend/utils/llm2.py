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
    is_from_textbook = True
    query_related_to_subject = True
    
    if use_rag:
        try:
            rag_result = query_knowledge_base(user_message, grade, subject)
            documents = rag_result.get("documents", [])
            is_from_textbook = rag_result.get("is_relevant", False)
            relevance_score = rag_result.get("relevance_score", 0)
            query_related_to_subject = rag_result.get("query_related_to_subject", True)
            
            if documents and is_from_textbook:
                context = format_context_for_prompt(documents)
                print(f"Retrieved {len(documents)} documents for query: {user_message[:50]}...")
            else:
                print(f"Topic NOT in textbook (relevance: {relevance_score:.3f}, related: {query_related_to_subject}): {user_message[:50]}...")
        except Exception as e:
            print(f"RAG retrieval error: {e}")
            context = ""
            is_from_textbook = False
    
    system_prompt = SYSTEM_PROMPT.format(grade=grade, subject=subject)
    
    if context and is_from_textbook:
        system_prompt += f"\n\nRelevant learning material:\n{context}"
    elif not is_from_textbook:
        if not query_related_to_subject:
            # Question is about a different subject entirely
            system_prompt += f"""

IMPORTANT: This question does NOT seem to be about {subject}. Please:
1. Tell the student: "This question doesn't seem to be about {subject}."
2. Suggest they select the correct subject (like Science, Computer, etc.)
3. Give a VERY brief explanation (2-3 sentences only) just to help
4. Encourage them to ask {subject} questions instead
"""
        else:
            system_prompt += f"""

IMPORTANT: This topic is NOT covered in the student's Grade {grade} {subject} textbook. Please:
1. First, kindly inform the student that this topic is not in their textbook
2. Then, provide a brief, simple explanation
3. Encourage the student to ask questions from their textbook topics
"""
    
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

def get_seedream_api_key() -> Optional[str]:
    """Get Seedream API key from file or environment"""
    # Try environment variable first
    api_key = os.getenv("SEEDREAM_API_KEY")
    if api_key:
        return api_key
    
    # Try reading from file
    key_file = "seedreem_api_key_image.txt"
    if os.path.exists(key_file):
        with open(key_file, 'r') as f:
            return f.read().strip()
    
    return None


def enhance_image_prompt(question: str, grade: int, subject: str) -> dict:
    """Use GPT-4o-mini as VisualPromptBuilder to create optimized image prompt for autistic students"""
    import json
    
    client = get_openai_client()
    if not client:
        # Fallback to basic icon prompt if OpenAI not available
        return {
            "prompt": f"Single flat vector ICON of: {question[:50]}. Style: simple app icon, clean shapes, high contrast, minimal detail. Isolated, centered, lots of empty space. NO text, NO background scene, NO extra objects.",
            "negative_prompt": "text, words, letters, background scene, multiple objects, clutter, detailed, complex"
        }
    
    system_prompt = """You are "VisualPromptBuilder" for an autism-friendly tutor.
Your job: convert a user question into a SINGLE ICON prompt for Recraft SVG.

CRITICAL RULES:
1) ONE ICON ONLY - identify the single most representative object/concept
2) The icon must be a simple, recognizable real-world object
3) NO text, NO background, NO extra objects
4) Clean, minimal, high contrast

Examples:
- "What is Internet" → "globe with wifi signal"
- "How does computer work" → "desktop computer"
- "What is photosynthesis" → "green leaf with sun rays"
- "Addition in math" → "plus symbol"

Return JSON ONLY:
{
  "icon": "simple description of ONE icon",
  "prompt": "Single flat vector ICON of: [icon]. Style: simple app icon, clean shapes, high contrast, minimal detail. Isolated, centered, lots of empty space. NO text, NO background scene, NO extra objects."
}"""

    user_prompt = f"""Question: "{question}"
Subject: {subject}

Generate a single icon prompt."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.5,
            max_tokens=300
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Try to parse JSON from response
        try:
            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            response_text = response_text.strip()
            
            prompt_data = json.loads(response_text)
            
            # Extract the prompt from JSON
            icon = prompt_data.get("icon", question[:30])
            final_prompt = prompt_data.get("prompt", "")
            
            # If no prompt in JSON, build it
            if not final_prompt:
                final_prompt = f"Single flat vector ICON of: {icon}. Style: simple app icon, clean shapes, high contrast, minimal detail. Isolated, centered, lots of empty space. NO text, NO background scene, NO extra objects."
            
            print(f"Enhanced prompt generated for icon: {icon}")
            
            return {
                "prompt": final_prompt,
                "negative_prompt": "text, words, letters, background scene, multiple objects, clutter, detailed, complex"
            }
            
        except json.JSONDecodeError:
            # If JSON parsing fails, build a simple prompt
            print(f"JSON parse failed, using fallback")
            return {
                "prompt": f"Single flat vector ICON of: {question[:50]}. Style: simple app icon, clean shapes, high contrast, minimal detail. Isolated, centered, lots of empty space. NO text, NO background scene, NO extra objects.",
                "negative_prompt": "text, words, letters, background scene, multiple objects, clutter, detailed, complex"
            }
        
    except Exception as e:
        print(f"Error enhancing prompt: {e}")
        # Fallback to basic icon prompt
        return {
            "prompt": f"Single flat vector ICON of: {question[:50]}. Style: simple app icon, clean shapes, high contrast, minimal detail. Isolated, centered, lots of empty space. NO text, NO background scene, NO extra objects.",
            "negative_prompt": "text, words, letters, background scene, multiple objects, clutter, detailed, complex"
        }


def generate_image(
    question: str,
    grade: int,
    subject: str
) -> Optional[str]:
    """Generate an educational image using NanoBanana Pro model"""
    import requests
    import time
    
    api_key = get_seedream_api_key()
    if not api_key:
        print("WaveSpeedAI API key not found")
        return None
    
    # Use GPT-4o-mini (VisualPromptBuilder) to enhance the prompt
    print("Enhancing prompt with GPT-4o-mini VisualPromptBuilder...")
    prompt_data = enhance_image_prompt(question, grade, subject)
    
    image_prompt = prompt_data.get("prompt", "")
    negative_prompt = prompt_data.get("negative_prompt", "clutter, confetti, decorations, complex backgrounds")
    
    print(f"Generated prompt: {image_prompt[:100]}...")
    print(f"Negative prompt: {negative_prompt}")
    
    # Use NanoBanana Pro API
    import requests
    import time
    
    print(f"Attempting NanoBanana Pro image generation for: {question[:50]}...")
    
    try:
        # NanoBanana Pro API endpoint
        API_URL = "https://gateway.bananapro.site/api/v1/images/generate"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        payload = {
            "model": "nano-banana-pro",
            "prompt": image_prompt,
            "type": "text-to-image",
            "resolution": "1K",
            "aspect_ratio": "1:1",
            "num_images": 1
        }
        
        # Submit the task
        response = requests.post(API_URL, headers=headers, json=payload, timeout=120)
        
        print(f"NanoBanana Pro response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"NanoBanana Pro response: {result}")
            
            # Check for images in response
            images = result.get("images", [])
            if images and len(images) > 0:
                print(f"Image generated successfully!")
                return images[0]
            
            # Alternative response format
            data = result.get("data", {})
            if data.get("status") == "completed":
                outputs = data.get("outputs", [])
                if outputs and len(outputs) > 0:
                    print(f"Image generated successfully!")
                    return outputs[0]
            
            # Check for image_url directly
            if result.get("image_url"):
                print(f"Image generated successfully!")
                return result.get("image_url")
                
        else:
            print(f"NanoBanana Pro API error: {response.status_code} - {response.text}")
            
    except requests.exceptions.Timeout:
        print("NanoBanana Pro API timeout")
    except Exception as e:
        print(f"NanoBanana Pro image generation error: {e}")
    
    # Fallback to OpenAI DALL-E
    print("Falling back to OpenAI DALL-E...")
    try:
        client = get_openai_client()
        if client:
            # Simplified prompt for DALL-E
            dalle_prompt = f"""Educational infographic about: {question}
            
Style: Flat vector illustration, colorful icons, white background, clean modern design.
Layout: Title at top, clear visual explanation with simple icons and arrows.
For Grade {grade} {subject} students."""
            
            response = client.images.generate(
                model="dall-e-3",
                prompt=dalle_prompt,
                size="1024x1024",
                quality="standard",
                n=1
            )
            
            if response.data and len(response.data) > 0:
                return response.data[0].url
                
    except Exception as e2:
        print(f"DALL-E fallback error: {e2}")
    
    print("All image generation methods failed")
    return None


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

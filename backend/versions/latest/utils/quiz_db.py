"""
Quiz Database Utility for AutiStudy
Stores quiz attempts, scores, and analytics data
"""

import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Optional, Any


# File-based storage for quiz data
QUIZ_DATA_DIR = "quiz_data"


def _ensure_dir():
    """Ensure quiz data directory exists"""
    os.makedirs(QUIZ_DATA_DIR, exist_ok=True)


def _get_user_file(user_email: str) -> str:
    """Get the file path for a user's quiz data"""
    safe_email = user_email.replace("@", "_at_").replace(".", "_")
    return os.path.join(QUIZ_DATA_DIR, f"{safe_email}_quiz.json")


def _load_user_data(user_email: str) -> Dict:
    """Load user's quiz data from file"""
    _ensure_dir()
    file_path = _get_user_file(user_email)
    
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    
    return {
        "user_email": user_email,
        "quiz_attempts": [],
        "total_questions_attempted": 0,
        "total_correct": 0,
        "total_time_seconds": 0,
        "subject_stats": {},
        "daily_stats": {},
        "streak_days": 0,
        "last_quiz_date": None
    }


def _save_user_data(user_email: str, data: Dict):
    """Save user's quiz data to file"""
    _ensure_dir()
    file_path = _get_user_file(user_email)
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
    except Exception as e:
        print(f"Error saving quiz data: {e}")


def save_quiz_attempt(
    user_email: str,
    grade: int,
    subject: str,
    questions: List[Dict],
    answers: List[str],
    correct_answers: List[str],
    time_per_question: List[float],
    total_time: float
) -> Dict:
    """
    Save a quiz attempt with detailed analytics.
    
    Args:
        user_email: User's email
        grade: Student's grade
        subject: Subject of the quiz
        questions: List of question dicts with 'question', 'options', 'correct', 'explanation'
        answers: List of user's answers
        correct_answers: List of correct answers
        time_per_question: Time taken for each question in seconds
        total_time: Total quiz time in seconds
    
    Returns:
        Dict with attempt summary
    """
    data = _load_user_data(user_email)
    
    # Calculate score
    num_correct = sum(1 for a, c in zip(answers, correct_answers) if a == c)
    num_questions = len(questions)
    score_percent = (num_correct / num_questions * 100) if num_questions > 0 else 0
    
    # Create attempt record
    attempt = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "grade": grade,
        "subject": subject,
        "num_questions": num_questions,
        "num_correct": num_correct,
        "score_percent": round(score_percent, 1),
        "total_time_seconds": round(total_time, 1),
        "avg_time_per_question": round(total_time / num_questions, 1) if num_questions > 0 else 0,
        "time_per_question": [round(t, 1) for t in time_per_question],
        "questions_detail": [
            {
                "question": q.get("question", ""),
                "user_answer": a,
                "correct_answer": c,
                "is_correct": a == c,
                "time_seconds": round(t, 1)
            }
            for q, a, c, t in zip(questions, answers, correct_answers, time_per_question)
        ]
    }
    
    # Update totals
    data["quiz_attempts"].append(attempt)
    data["total_questions_attempted"] += num_questions
    data["total_correct"] += num_correct
    data["total_time_seconds"] += total_time
    
    # Update subject stats
    if subject not in data["subject_stats"]:
        data["subject_stats"][subject] = {
            "attempts": 0,
            "questions": 0,
            "correct": 0,
            "total_time": 0
        }
    
    data["subject_stats"][subject]["attempts"] += 1
    data["subject_stats"][subject]["questions"] += num_questions
    data["subject_stats"][subject]["correct"] += num_correct
    data["subject_stats"][subject]["total_time"] += total_time
    
    # Update daily stats
    today = datetime.now().strftime("%Y-%m-%d")
    if today not in data["daily_stats"]:
        data["daily_stats"][today] = {
            "attempts": 0,
            "questions": 0,
            "correct": 0,
            "time": 0
        }
    
    data["daily_stats"][today]["attempts"] += 1
    data["daily_stats"][today]["questions"] += num_questions
    data["daily_stats"][today]["correct"] += num_correct
    data["daily_stats"][today]["time"] += total_time
    
    # Update streak
    if data["last_quiz_date"]:
        last_date = datetime.fromisoformat(data["last_quiz_date"]).date()
        today_date = datetime.now().date()
        
        if (today_date - last_date).days == 1:
            data["streak_days"] += 1
        elif (today_date - last_date).days > 1:
            data["streak_days"] = 1
    else:
        data["streak_days"] = 1
    
    data["last_quiz_date"] = datetime.now().isoformat()
    
    _save_user_data(user_email, data)
    
    return attempt


def get_user_analytics(user_email: str) -> Dict:
    """Get comprehensive analytics for a user"""
    data = _load_user_data(user_email)
    
    # Calculate overall stats
    total_attempts = len(data["quiz_attempts"])
    total_questions = data["total_questions_attempted"]
    total_correct = data["total_correct"]
    total_time = data["total_time_seconds"]
    
    overall_accuracy = (total_correct / total_questions * 100) if total_questions > 0 else 0
    avg_time_per_question = (total_time / total_questions) if total_questions > 0 else 0
    
    # Get recent attempts (last 10)
    recent_attempts = data["quiz_attempts"][-10:][::-1]
    
    # Get subject breakdown
    subject_breakdown = {}
    for subject, stats in data["subject_stats"].items():
        accuracy = (stats["correct"] / stats["questions"] * 100) if stats["questions"] > 0 else 0
        subject_breakdown[subject] = {
            "attempts": stats["attempts"],
            "questions": stats["questions"],
            "correct": stats["correct"],
            "accuracy": round(accuracy, 1),
            "avg_time": round(stats["total_time"] / stats["questions"], 1) if stats["questions"] > 0 else 0
        }
    
    # Get daily activity (last 14 days)
    daily_activity = []
    for i in range(14):
        date = (datetime.now() - __import__("datetime").timedelta(days=13-i)).strftime("%Y-%m-%d")
        if date in data["daily_stats"]:
            stats = data["daily_stats"][date]
            daily_activity.append({
                "date": date,
                "questions": stats["questions"],
                "correct": stats["correct"],
                "accuracy": round(stats["correct"] / stats["questions"] * 100, 1) if stats["questions"] > 0 else 0,
                "time": round(stats["time"] / 60, 1)  # Convert to minutes
            })
        else:
            daily_activity.append({
                "date": date,
                "questions": 0,
                "correct": 0,
                "accuracy": 0,
                "time": 0
            })
    
    # Performance trend (accuracy over last 10 quizzes)
    performance_trend = []
    for attempt in data["quiz_attempts"][-10:]:
        performance_trend.append({
            "date": attempt["timestamp"][:10],
            "accuracy": attempt["score_percent"],
            "subject": attempt["subject"]
        })
    
    return {
        "total_attempts": total_attempts,
        "total_questions": total_questions,
        "total_correct": total_correct,
        "overall_accuracy": round(overall_accuracy, 1),
        "total_time_minutes": round(total_time / 60, 1),
        "avg_time_per_question": round(avg_time_per_question, 1),
        "streak_days": data["streak_days"],
        "recent_attempts": recent_attempts,
        "subject_breakdown": subject_breakdown,
        "daily_activity": daily_activity,
        "performance_trend": performance_trend
    }


def get_quiz_history(user_email: str, limit: int = 20) -> List[Dict]:
    """Get recent quiz history for a user"""
    data = _load_user_data(user_email)
    return data["quiz_attempts"][-limit:][::-1]


def get_subject_performance(user_email: str, subject: str) -> Dict:
    """Get performance stats for a specific subject"""
    data = _load_user_data(user_email)
    
    if subject not in data["subject_stats"]:
        return {
            "attempts": 0,
            "questions": 0,
            "correct": 0,
            "accuracy": 0,
            "avg_time": 0,
            "recent_scores": []
        }
    
    stats = data["subject_stats"][subject]
    accuracy = (stats["correct"] / stats["questions"] * 100) if stats["questions"] > 0 else 0
    
    # Get recent scores for this subject
    recent_scores = [
        a["score_percent"] 
        for a in data["quiz_attempts"][-20:] 
        if a["subject"] == subject
    ][-10:]
    
    return {
        "attempts": stats["attempts"],
        "questions": stats["questions"],
        "correct": stats["correct"],
        "accuracy": round(accuracy, 1),
        "avg_time": round(stats["total_time"] / stats["questions"], 1) if stats["questions"] > 0 else 0,
        "recent_scores": recent_scores
    }


def stars_for_score(score_percent: float) -> int:
    """Return stars earned (1-5) based on quiz score percentage."""
    if score_percent >= 90:
        return 5
    elif score_percent >= 80:
        return 4
    elif score_percent >= 70:
        return 3
    elif score_percent >= 60:
        return 2
    else:
        return 1  # Always give at least 1 star for trying!

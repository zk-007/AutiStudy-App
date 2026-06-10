"""
Learning Analytics Page for AutiStudy
Beautiful charts and statistics showing student progress
"""

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd
from datetime import datetime, timedelta

from utils.language import t, is_urdu, get_language
from utils.quiz_db import get_user_analytics, get_quiz_history


def _inject_css():
    st.markdown(
        """
        <style>
        .stApp {
            background: linear-gradient(135deg, #EAF2FF 0%, #F4F8FF 45%, #EDEBFF 100%);
        }

        section.main > div.block-container {
            max-width: 1200px;
            padding-top: 1.5rem;
            padding-bottom: 2.5rem;
            background: rgba(255,255,255,0.65);
            border-radius: 22px;
            box-shadow: 0 12px 35px rgba(15,23,42,0.07);
        }

        .analytics-header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .analytics-title {
            color: #0F2D4A;
            font-size: 2.5rem;
            font-weight: 900;
            margin: 0;
        }

        .analytics-subtitle {
            color: #64748B;
            font-size: 1.15rem;
            margin: 0.5rem 0 0 0;
        }

        .stat-card {
            background: white;
            border-radius: 20px;
            padding: 1.5rem;
            text-align: center;
            box-shadow: 0 8px 25px rgba(15,23,42,0.06);
            border: 1px solid #E2E8F0;
            height: 100%;
        }

        .stat-icon {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 900;
            color: #2563EB;
            margin: 0;
            line-height: 1.2;
        }

        .stat-label {
            color: #64748B;
            font-size: 1rem;
            margin: 0.3rem 0 0 0;
            font-weight: 600;
        }

        .chart-card {
            background: white;
            border-radius: 20px;
            padding: 1.5rem;
            box-shadow: 0 8px 25px rgba(15,23,42,0.06);
            border: 1px solid #E2E8F0;
            margin-bottom: 1.5rem;
        }

        .chart-title {
            color: #0F2D4A;
            font-size: 1.3rem;
            font-weight: 800;
            margin: 0 0 1rem 0;
        }

        .streak-card {
            background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
            border-radius: 20px;
            padding: 1.5rem;
            text-align: center;
            color: white;
        }

        .streak-number {
            font-size: 3rem;
            font-weight: 900;
            margin: 0;
        }

        .streak-label {
            font-size: 1.1rem;
            opacity: 0.9;
            margin: 0;
        }

        .history-item {
            background: #F8FAFC;
            border-radius: 12px;
            padding: 1rem 1.2rem;
            margin-bottom: 0.75rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .history-subject {
            color: #0F2D4A;
            font-weight: 700;
            font-size: 1.05rem;
        }

        .history-score {
            color: #2563EB;
            font-weight: 800;
            font-size: 1.2rem;
        }

        .history-date {
            color: #94A3B8;
            font-size: 0.85rem;
        }

        .subject-badge {
            display: inline-block;
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 700;
            margin-right: 0.5rem;
        }

        .badge-maths { background: #DBEAFE; color: #1D4ED8; }
        .badge-science { background: #D1FAE5; color: #059669; }
        .badge-computer { background: #EDE9FE; color: #7C3AED; }

        .no-data-box {
            background: #F8FAFC;
            border: 2px dashed #CBD5E1;
            border-radius: 16px;
            padding: 3rem;
            text-align: center;
            color: #64748B;
        }

        .no-data-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }

        .rtl-text {
            direction: rtl;
            text-align: right;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_analytics():
    _inject_css()
    
    user = st.session_state.get("user", {})
    user_email = user.get("email", "guest")
    user_name = user.get("name", "Student")
    
    urdu = is_urdu()
    text_dir = "rtl-text" if urdu else ""
    
    # Get analytics data
    analytics = get_user_analytics(user_email)
    
    # Header
    col1, col2, col3 = st.columns([1, 4, 1])
    with col1:
        if st.button("← Back", key="back_dash", use_container_width=True):
            st.session_state.navigate("dashboard")
    
    title = "سیکھنے کے تجزیات" if urdu else "Learning Analytics"
    subtitle = f"{user_name} کی پیش رفت" if urdu else f"{user_name}'s Progress"
    
    st.markdown(
        f"""
        <div class="analytics-header {text_dir}">
            <h1 class="analytics-title">📊 {title}</h1>
            <p class="analytics-subtitle">{subtitle}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    
    # Check if there's any data
    if analytics["total_attempts"] == 0:
        render_no_data(urdu)
        return
    
    # Top Stats Row
    col1, col2, col3, col4, col5 = st.columns(5)
    
    with col1:
        st.markdown(
            f"""
            <div class="stat-card">
                <div class="stat-icon">📝</div>
                <p class="stat-value">{analytics['total_attempts']}</p>
                <p class="stat-label">Quizzes Taken</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col2:
        st.markdown(
            f"""
            <div class="stat-card">
                <div class="stat-icon">❓</div>
                <p class="stat-value">{analytics['total_questions']}</p>
                <p class="stat-label">Questions</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col3:
        st.markdown(
            f"""
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <p class="stat-value">{analytics['total_correct']}</p>
                <p class="stat-label">Correct</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col4:
        st.markdown(
            f"""
            <div class="stat-card">
                <div class="stat-icon">🎯</div>
                <p class="stat-value">{analytics['overall_accuracy']}%</p>
                <p class="stat-label">Accuracy</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col5:
        st.markdown(
            f"""
            <div class="streak-card">
                <p class="streak-number">🔥 {analytics['streak_days']}</p>
                <p class="streak-label">Day Streak</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    st.markdown("<br>", unsafe_allow_html=True)
    
    # Charts Row 1
    col1, col2 = st.columns(2)
    
    with col1:
        # Performance Over Time
        st.markdown('<div class="chart-card">', unsafe_allow_html=True)
        st.markdown('<h3 class="chart-title">📈 Performance Over Time</h3>', unsafe_allow_html=True)
        
        if analytics["performance_trend"]:
            df = pd.DataFrame(analytics["performance_trend"])
            
            fig = px.line(
                df, 
                x="date", 
                y="accuracy",
                markers=True,
                color_discrete_sequence=["#2563EB"]
            )
            
            fig.update_layout(
                xaxis_title="Date",
                yaxis_title="Accuracy (%)",
                yaxis_range=[0, 100],
                height=300,
                margin=dict(l=20, r=20, t=20, b=20),
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
            )
            
            fig.update_traces(
                line=dict(width=3),
                marker=dict(size=10)
            )
            
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Complete more quizzes to see your performance trend!")
        
        st.markdown('</div>', unsafe_allow_html=True)
    
    with col2:
        # Subject Breakdown Pie Chart
        st.markdown('<div class="chart-card">', unsafe_allow_html=True)
        st.markdown('<h3 class="chart-title">📚 Questions by Subject</h3>', unsafe_allow_html=True)
        
        if analytics["subject_breakdown"]:
            subjects = list(analytics["subject_breakdown"].keys())
            questions = [analytics["subject_breakdown"][s]["questions"] for s in subjects]
            
            colors = {
                "Maths": "#2563EB",
                "General Science": "#10B981",
                "Computer": "#8B5CF6"
            }
            color_list = [colors.get(s, "#94A3B8") for s in subjects]
            
            fig = go.Figure(data=[go.Pie(
                labels=subjects,
                values=questions,
                hole=0.4,
                marker_colors=color_list
            )])
            
            fig.update_layout(
                height=300,
                margin=dict(l=20, r=20, t=20, b=20),
                paper_bgcolor="rgba(0,0,0,0)",
                showlegend=True,
                legend=dict(orientation="h", yanchor="bottom", y=-0.2)
            )
            
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No subject data yet!")
        
        st.markdown('</div>', unsafe_allow_html=True)
    
    # Charts Row 2
    col1, col2 = st.columns(2)
    
    with col1:
        # Daily Activity Bar Chart
        st.markdown('<div class="chart-card">', unsafe_allow_html=True)
        st.markdown('<h3 class="chart-title">📅 Daily Activity (Last 14 Days)</h3>', unsafe_allow_html=True)
        
        if analytics["daily_activity"]:
            df = pd.DataFrame(analytics["daily_activity"])
            df["date_short"] = df["date"].apply(lambda x: x[5:])  # MM-DD format
            
            fig = go.Figure()
            
            fig.add_trace(go.Bar(
                x=df["date_short"],
                y=df["questions"],
                name="Questions",
                marker_color="#2563EB"
            ))
            
            fig.update_layout(
                xaxis_title="Date",
                yaxis_title="Questions Answered",
                height=300,
                margin=dict(l=20, r=20, t=20, b=20),
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        st.markdown('</div>', unsafe_allow_html=True)
    
    with col2:
        # Subject Accuracy Comparison
        st.markdown('<div class="chart-card">', unsafe_allow_html=True)
        st.markdown('<h3 class="chart-title">🎯 Accuracy by Subject</h3>', unsafe_allow_html=True)
        
        if analytics["subject_breakdown"]:
            subjects = list(analytics["subject_breakdown"].keys())
            accuracies = [analytics["subject_breakdown"][s]["accuracy"] for s in subjects]
            
            colors = {
                "Maths": "#2563EB",
                "General Science": "#10B981",
                "Computer": "#8B5CF6"
            }
            color_list = [colors.get(s, "#94A3B8") for s in subjects]
            
            fig = go.Figure(data=[go.Bar(
                x=subjects,
                y=accuracies,
                marker_color=color_list,
                text=[f"{a}%" for a in accuracies],
                textposition="outside"
            )])
            
            fig.update_layout(
                yaxis_title="Accuracy (%)",
                yaxis_range=[0, 100],
                height=300,
                margin=dict(l=20, r=20, t=30, b=20),
                paper_bgcolor="rgba(0,0,0,0)",
                plot_bgcolor="rgba(0,0,0,0)",
            )
            
            st.plotly_chart(fig, use_container_width=True)
        
        st.markdown('</div>', unsafe_allow_html=True)
    
    # Time Analysis
    st.markdown('<div class="chart-card">', unsafe_allow_html=True)
    st.markdown('<h3 class="chart-title">⏱️ Time Analysis</h3>', unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.markdown(
            f"""
            <div style="text-align:center; padding:1rem;">
                <div style="font-size:2.5rem;">⏱️</div>
                <p style="font-size:2rem; font-weight:800; color:#2563EB; margin:0.5rem 0;">{analytics['total_time_minutes']} min</p>
                <p style="color:#64748B; margin:0;">Total Study Time</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col2:
        st.markdown(
            f"""
            <div style="text-align:center; padding:1rem;">
                <div style="font-size:2.5rem;">⚡</div>
                <p style="font-size:2rem; font-weight:800; color:#10B981; margin:0.5rem 0;">{analytics['avg_time_per_question']}s</p>
                <p style="color:#64748B; margin:0;">Avg Time per Question</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    with col3:
        # Calculate improvement message
        if len(analytics["performance_trend"]) >= 2:
            first_score = analytics["performance_trend"][0]["accuracy"]
            last_score = analytics["performance_trend"][-1]["accuracy"]
            improvement = last_score - first_score
            
            if improvement > 0:
                improvement_text = f"+{improvement:.0f}%"
                improvement_color = "#10B981"
                improvement_emoji = "📈"
            elif improvement < 0:
                improvement_text = f"{improvement:.0f}%"
                improvement_color = "#EF4444"
                improvement_emoji = "📉"
            else:
                improvement_text = "0%"
                improvement_color = "#64748B"
                improvement_emoji = "➡️"
        else:
            improvement_text = "N/A"
            improvement_color = "#64748B"
            improvement_emoji = "📊"
        
        st.markdown(
            f"""
            <div style="text-align:center; padding:1rem;">
                <div style="font-size:2.5rem;">{improvement_emoji}</div>
                <p style="font-size:2rem; font-weight:800; color:{improvement_color}; margin:0.5rem 0;">{improvement_text}</p>
                <p style="color:#64748B; margin:0;">Improvement</p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    
    st.markdown('</div>', unsafe_allow_html=True)
    
    # Recent Quiz History
    st.markdown('<div class="chart-card">', unsafe_allow_html=True)
    st.markdown('<h3 class="chart-title">📜 Recent Quizzes</h3>', unsafe_allow_html=True)
    
    if analytics["recent_attempts"]:
        for attempt in analytics["recent_attempts"][:5]:
            subject = attempt["subject"]
            score = attempt["score_percent"]
            date = attempt["timestamp"][:10]
            num_q = attempt["num_questions"]
            time_taken = attempt["total_time_seconds"]
            
            badge_class = {
                "Maths": "badge-maths",
                "General Science": "badge-science",
                "Computer": "badge-computer"
            }.get(subject, "badge-maths")
            
            score_color = "#10B981" if score >= 70 else "#F59E0B" if score >= 50 else "#EF4444"
            
            st.markdown(
                f"""
                <div class="history-item">
                    <div>
                        <span class="subject-badge {badge_class}">{subject}</span>
                        <span class="history-date">{date}</span>
                    </div>
                    <div style="text-align:right;">
                        <span class="history-score" style="color:{score_color};">{score:.0f}%</span>
                        <span class="history-date" style="display:block;">{num_q} questions • {time_taken:.0f}s</span>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.info("No quiz history yet. Take a quiz to see your history!")
    
    st.markdown('</div>', unsafe_allow_html=True)
    
    # Action buttons
    st.markdown("<br>", unsafe_allow_html=True)
    col1, col2, col3 = st.columns([1, 1, 1])
    
    with col1:
        if st.button("📝 Take a Quiz", key="take_quiz", use_container_width=True, type="primary"):
            st.session_state.navigate("practice_quiz")
    
    with col2:
        if st.button("🤖 AI Tutor", key="ai_tutor", use_container_width=True):
            st.session_state.navigate("ai_tutor")
    
    with col3:
        if st.button("🏠 Dashboard", key="go_dash", use_container_width=True):
            st.session_state.navigate("dashboard")


def render_no_data(urdu: bool):
    """Render the no data state"""
    
    title = "ابھی تک کوئی ڈیٹا نہیں" if urdu else "No Data Yet"
    message = "اپنی پیش رفت دیکھنے کے لیے کوئز لیں!" if urdu else "Take a quiz to see your learning analytics!"
    
    st.markdown(
        f"""
        <div class="no-data-box">
            <div class="no-data-icon">📊</div>
            <h2 style="color:#0F2D4A; margin:0 0 0.5rem 0;">{title}</h2>
            <p style="font-size:1.1rem; margin:0 0 1.5rem 0;">{message}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("📝 Take Your First Quiz!", key="first_quiz", use_container_width=True, type="primary"):
            st.session_state.navigate("practice_quiz")

"""
AutiStudy Media Agent — Full Agentic AI (ReAct Pattern)
========================================================

Pattern:   ReAct = Reason → Act → Observe → Reason → Act → Observe → ...
Framework: Pure OpenAI Function Calling (GPT-4o) — no LangGraph, no LangChain
Memory:    Cross-session student memory (utils/agent_memory.py)

Full agentic loop per cycle:
  1.  Analyze facial emotion (OpenAI Vision)
  2.  Load student memory (what worked before, struggles, preferred modality)
  3.  Agent PLANS: "Here is my strategy for this situation"
  4.  Agent ACTS: calls tool #1
  5.  Tool executes → result injected as OBSERVATION
  6.  Agent REFLECTS: "Was that enough? Do I need another action?"
  7.  If needed → Agent ACTS again (tool #2)
  8.  Repeat up to MAX_ITERATIONS (3)
  9.  Record outcome to memory
  10. Return: all actions taken + reasoning chain + final modality

This is a COMPLETE agentic system:
  ✅ LLM decides actions (not hardcoded rules)
  ✅ Tool / function calling
  ✅ Multi-step ReAct loop (act → observe → act again)
  ✅ Self-reflection after each action
  ✅ Cross-session memory (learns from past)
  ✅ Planning before acting
  ✅ Context-awareness (question, answer, grade, subject, memory)
  ✅ Avoids repeating ineffective tools
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from openai import OpenAI

from utils.emotion import analyze_emotion
from utils.chat_db import get_chat_session
from utils.agent_memory import (
    get_memory_context,
    record_tool_outcome,
    record_session_summary,
)

# ── Client ─────────────────────────────────────────────────────────────────────

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            from utils.secrets import get_secret
            api_key = get_secret("OPENAI_API_KEY", "")
        _client = OpenAI(api_key=api_key)
    return _client


MAX_ITERATIONS = 3   # max tool calls per cycle before stopping

# ── Tool Definitions ────────────────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "do_nothing",
            "description": (
                "Student is happy, focused, or already understands. "
                "No teaching intervention needed right now."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string", "description": "Why no action is needed."}
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simplify_text",
            "description": (
                "Re-explain the same concept in much simpler, shorter words. "
                "Use when: student got a long or complex text answer and looks confused. "
                "Write as if explaining to a curious 8-year-old."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "simplified_explanation": {
                        "type": "string",
                        "description": "2-4 short, simple sentences. No jargon. Very easy words.",
                    },
                },
                "required": ["reason", "simplified_explanation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_visual",
            "description": (
                "Show a picture or illustration of the concept. "
                "Use when: concept is visual (counting, shapes, fractions, diagrams, "
                "geography, biology, science experiments)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "visual_description": {
                        "type": "string",
                        "description": "What kind of visual to show (e.g. 'fraction bar showing 1/2 + 1/4').",
                    },
                },
                "required": ["reason", "visual_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "speak_aloud",
            "description": (
                "Read the last answer aloud using voice narration. "
                "Use when: student has been reading a lot, looks tired, or has a reading difficulty."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explain_steps",
            "description": (
                "Break the concept into very small numbered steps, one at a time. "
                "Use when: student is confused about a PROCESS or PROCEDURE "
                "(long division, equation solving, scientific method, writing steps)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "step_by_step": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "3-6 steps. Each step = one short sentence. Start simple.",
                    },
                },
                "required": ["reason", "step_by_step"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "use_analogy",
            "description": (
                "Explain using a real-world analogy the child can relate to. "
                "Use when: concept is abstract (fractions, variables, forces, atoms, gravity). "
                "Connect to food, sports, games, family, everyday objects."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "analogy_explanation": {
                        "type": "string",
                        "description": "Short, fun analogy. e.g. 'Fractions are like cutting a pizza...'",
                    },
                },
                "required": ["reason", "analogy_explanation"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_prerequisite",
            "description": (
                "Ask a gentle question to check if the student knows a simpler concept "
                "that is needed to understand the current topic. "
                "Use when: student looks completely lost, not just slightly confused."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "prerequisite_concept": {
                        "type": "string",
                        "description": "The simpler concept the student must know first.",
                    },
                    "check_question": {
                        "type": "string",
                        "description": "Gentle question to ask. e.g. 'Do you know what multiplication is?'",
                    },
                },
                "required": ["reason", "prerequisite_concept", "check_question"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "notify_parent",
            "description": (
                "Alert the parent dashboard that the student is very stuck "
                "and needs human help. "
                "LAST RESORT ONLY — use after trying at least 2 other tools."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {"type": "string"},
                    "topic_struggling_with": {
                        "type": "string",
                        "description": "Topic the student is stuck on.",
                    },
                },
                "required": ["reason", "topic_struggling_with"],
            },
        },
    },
]

# ── Helpers ─────────────────────────────────────────────────────────────────────

TOOL_TO_MODALITY = {
    "do_nothing":          "text",
    "simplify_text":       "text",
    "generate_visual":     "text_image",
    "speak_aloud":         "text_image_voice",
    "explain_steps":       "step_by_step",
    "use_analogy":         "text",
    "check_prerequisite":  "text",
    "notify_parent":       "text",
}

TOOL_EMOJI = {
    "do_nothing":          "✅",
    "simplify_text":       "📝",
    "generate_visual":     "🖼️",
    "speak_aloud":         "🔊",
    "explain_steps":       "🪜",
    "use_analogy":         "🍕",
    "check_prerequisite":  "🔍",
    "notify_parent":       "👨‍👩‍👧",
}

TERMINAL_TOOLS = {"do_nothing", "notify_parent"}


def _build_system_prompt(memory_context: str) -> str:
    return f"""You are AutiStudy's Teaching Agent — an adaptive AI tutor for autistic children aged 8-12.

Your goal: Help the student UNDERSTAND. Observe their facial emotion, reason carefully, then take the best action.

{memory_context}

Decision principles (in order):
1. If happy/focused → do_nothing immediately.
2. First confusion → prefer simplify_text or use_analogy on the SAME topic as last_question.
3. Second confusion → generate_visual (pictures help most) for the SAME topic.
4. Persistent confusion → explain_steps (break into micro-steps) for the SAME topic.
5. Frustration + 3+ confused → check_prerequisite ONLY if a genuine prerequisite gap exists.
6. notify_parent ONLY as absolute last resort after 2+ other tools failed.

CRITICAL: The student already asked a question (see last_question). NEVER ask "what question do you want to understand?"
Always re-explain or adapt help for that same question and subject.

After each tool you call, you will receive an OBSERVATION showing what happened.
Then decide: is ONE action enough, or does the student need an additional immediate action?
Call do_nothing when you are satisfied with what has been done.

You have memory of this student's past sessions — USE IT to prefer tools that worked before.
Be kind, patient, and creative. Never repeat the exact same approach twice in a row."""


def _execute_tool(tool_name: str, tool_args: dict) -> dict:
    """
    Simulate tool execution and return an observation string.
    The actual side-effects (image generation, TTS) happen on the frontend.
    The agent just needs to know the tool was triggered successfully.
    """
    if tool_name == "do_nothing":
        return {"status": "ok", "message": "No action taken — student is fine."}

    if tool_name == "simplify_text":
        text = tool_args.get("simplified_explanation", "")
        return {
            "status": "ok",
            "message": f"Simplified explanation prepared ({len(text)} chars). Will be shown to student.",
            "content": text,
        }

    if tool_name == "generate_visual":
        desc = tool_args.get("visual_description", "")
        return {
            "status": "ok",
            "message": f"Visual aid generation triggered: '{desc}'. Image will appear in chat.",
        }

    if tool_name == "speak_aloud":
        return {
            "status": "ok",
            "message": "Text-to-speech triggered. The last answer will be read aloud.",
        }

    if tool_name == "explain_steps":
        steps = tool_args.get("step_by_step", [])
        return {
            "status": "ok",
            "message": f"Step-by-step breakdown prepared ({len(steps)} steps). Will be shown to student.",
            "steps": steps,
        }

    if tool_name == "use_analogy":
        analogy = tool_args.get("analogy_explanation", "")
        return {
            "status": "ok",
            "message": f"Analogy prepared: '{analogy[:80]}...' Will be sent to student.",
            "content": analogy,
        }

    if tool_name == "check_prerequisite":
        q = tool_args.get("check_question", "")
        return {
            "status": "ok",
            "message": f"Prerequisite check question ready: '{q}'",
            "content": q,
        }

    if tool_name == "notify_parent":
        topic = tool_args.get("topic_struggling_with", "")
        return {
            "status": "ok",
            "message": f"Parent alert sent for topic: '{topic}'.",
        }

    return {"status": "ok", "message": f"Tool '{tool_name}' executed."}


# ── Main Agent Run ──────────────────────────────────────────────────────────────

def run_media_agent(
    image_b64: str,
    session_id: str,
    user_email: str,
    grade: int,
    subject: str,
    consecutive_confused: int = 0,
    tools_used_this_session: list[str] | None = None,
) -> dict[str, Any]:
    """
    Full ReAct agentic loop.

    Returns:
    {
      emotion, confidence, understood, description,
      plan,                    ← agent's initial plan
      actions: [               ← list of all tools called this cycle
        {tool_called, tool_emoji, reasoning, action_data, observation}
      ],
      final_tool: str,         ← last tool called
      final_modality: str,
      tool_emoji: str,
      reasoning: str,          ← last reasoning
      action_data: dict,       ← last tool's payload
      iterations: int,
      duration_ms: int,
      memory_context: str,     ← what agent knew from memory
    }
    """
    start = time.time()
    tools_used = tools_used_this_session or []
    client = _get_client()

    # ── Step 1: Emotion Detection ──────────────────────────────────────────
    emotion_result = analyze_emotion(image_b64)
    emotion = emotion_result["emotion"]
    understood = emotion_result["understood"]
    confidence = emotion_result["confidence"]
    description = emotion_result.get("description", "")

    # ── Step 2: Load Memory ────────────────────────────────────────────────
    memory_context = get_memory_context(user_email, subject)

    # ── Step 3: Get Chat Context ───────────────────────────────────────────
    last_question = "No question yet"
    last_answer = "No answer yet"
    topic_hint = ""
    try:
        session = get_chat_session(user_email, session_id)
        if session:
            msgs = session.get("messages", [])
            user_msgs = [m for m in msgs if m.get("role") == "user"]
            asst_msgs = [m for m in msgs if m.get("role") == "assistant"]
            if user_msgs:
                last_question = user_msgs[-1].get("content", "")[:400]
                topic_hint = last_question[:60]
            if asst_msgs:
                last_answer = asst_msgs[-1].get("content", "")[:600]
    except Exception:
        pass

    # ── Step 4: Build initial situation message ────────────────────────────
    situation = f"""Current student situation:
- Grade {grade} | Subject: {subject}
- Emotion: {emotion} ({confidence:.0%} confidence) — {description}
- Confused reads in a row: {consecutive_confused}
- Tools already used this topic: {tools_used if tools_used else 'none'}

Last student question: "{last_question}"

Last tutor answer: "{last_answer}"

First, briefly state your PLAN (1 sentence), then call the most appropriate tool."""

    # ── Step 5: ReAct Loop ────────────────────────────────────────────────
    system_prompt = _build_system_prompt(memory_context)
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": situation},
    ]

    actions: list[dict] = []
    plan_text = ""
    final_tool = "do_nothing"
    final_modality = "text"
    final_reasoning = ""
    final_action_data: dict = {}

    # Filter out heavily-used tools (used 2+ times already)
    def available_tools():
        return [
            t for t in TOOLS
            if tools_used.count(t["function"]["name"]) < 2
            or t["function"]["name"] in ("do_nothing",)
        ]

    for iteration in range(MAX_ITERATIONS):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=available_tools(),
            tool_choice="required",
            max_tokens=700,
            temperature=0.2,
        )

        assistant_msg = response.choices[0].message

        # Extract plan from text part (if any) on first iteration
        if iteration == 0 and assistant_msg.content:
            plan_text = assistant_msg.content.strip()

        # Parse tool call
        if not assistant_msg.tool_calls:
            break

        tool_call = assistant_msg.tool_calls[0]
        tool_name = tool_call.function.name
        try:
            tool_args = json.loads(tool_call.function.arguments)
        except Exception:
            tool_args = {}

        reasoning = tool_args.get("reason", "")

        # Execute tool
        observation = _execute_tool(tool_name, tool_args)

        # Build action_data
        action_data: dict = {}
        if tool_name == "simplify_text":
            action_data["simplified_explanation"] = tool_args.get("simplified_explanation", "")
        elif tool_name == "explain_steps":
            action_data["steps"] = tool_args.get("step_by_step", [])
        elif tool_name == "use_analogy":
            action_data["analogy"] = tool_args.get("analogy_explanation", "")
        elif tool_name == "check_prerequisite":
            action_data["prerequisite"] = tool_args.get("prerequisite_concept", "")
            action_data["check_question"] = tool_args.get("check_question", "")
        elif tool_name == "generate_visual":
            action_data["visual_description"] = tool_args.get("visual_description", "")
        elif tool_name == "notify_parent":
            action_data["topic"] = tool_args.get("topic_struggling_with", subject)

        # Record action
        actions.append({
            "iteration": iteration + 1,
            "tool_called": tool_name,
            "tool_emoji": TOOL_EMOJI.get(tool_name, "🤖"),
            "reasoning": reasoning,
            "action_data": action_data,
            "observation": observation.get("message", ""),
        })

        # Track for this session
        if tool_name != "do_nothing":
            tools_used = [*tools_used, tool_name]

        # Update final values
        final_tool = tool_name
        final_modality = TOOL_TO_MODALITY.get(tool_name, "text")
        final_reasoning = reasoning
        final_action_data = action_data

        # Stop if terminal tool or understood
        if tool_name in TERMINAL_TOOLS:
            break

        # Add assistant message + observation to messages
        messages.append({"role": "assistant", "content": assistant_msg.content, "tool_calls": [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {"name": tool_name, "arguments": tool_call.function.arguments},
            }
        ]})
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(observation),
        })

        # Reflection prompt for next iteration
        messages.append({
            "role": "user",
            "content": (
                "Observation received. The action was executed successfully. "
                "Reflect: Is this single action sufficient for the student right now, "
                "or does the student immediately need one more action? "
                "If one more is needed, call it now. Otherwise call do_nothing."
            ),
        })

    # ── Step 6: Record outcome to memory ──────────────────────────────────
    try:
        record_tool_outcome(
            email=user_email,
            subject=subject,
            tool_name=final_tool,
            modality=final_modality,
            resolved=understood,
            topic=topic_hint,
        )
    except Exception:
        pass

    duration_ms = int((time.time() - start) * 1000)

    return {
        "emotion": emotion,
        "confidence": confidence,
        "understood": understood,
        "description": description,
        # Agent outputs
        "plan": plan_text,
        "actions": actions,
        "iterations": len(actions),
        # Final decision
        "tool_called": final_tool,
        "tool_emoji": TOOL_EMOJI.get(final_tool, "🤖"),
        "reasoning": final_reasoning,
        "modality": final_modality,
        "action_data": final_action_data,
        # Meta
        "tools_used_this_session": tools_used,
        "memory_context": memory_context,
        "duration_ms": duration_ms,
    }


def decide_from_emotion(
    emotion: str,
    confidence: float,
    understood: bool,
    description: str,
    session_id: str,
    user_email: str,
    grade: int,
    subject: str,
    consecutive_confused: int = 0,
    tools_used_this_session: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run the full ReAct agent loop using a PRE-ANALYZED emotion.
    Skips the OpenAI Vision call entirely (emotion comes from MediaPipe in browser).

    This is the FAST path:
      MediaPipe (30fps, browser) → emotion → this function → GPT-4o agent decides tool

    Compared to run_media_agent(), this saves ~500ms per call (no Vision API).
    """
    start = time.time()
    tools_used = tools_used_this_session or []

    # Load memory
    memory_context = get_memory_context(user_email, subject)

    # Get chat context
    last_question = "No question yet"
    last_answer = "No answer yet"
    topic_hint = ""
    try:
        session = get_chat_session(user_email, session_id)
        if session:
            msgs = session.get("messages", [])
            user_msgs = [m for m in msgs if m.get("role") == "user"]
            asst_msgs = [m for m in msgs if m.get("role") == "assistant"]
            if user_msgs:
                last_question = user_msgs[-1].get("content", "")[:400]
                topic_hint = last_question[:60]
            if asst_msgs:
                last_answer = asst_msgs[-1].get("content", "")[:600]
    except Exception:
        pass

    # Build situation message (no vision step — emotion already known)
    situation = f"""Current student situation (emotion detected by MediaPipe in real-time):
- Grade {grade} | Subject: {subject}
- Emotion: {emotion} ({confidence:.0%} confidence) — {description}
- Understood: {understood}
- Confused reads in a row: {consecutive_confused}
- Tools already used this topic: {tools_used if tools_used else 'none'}

Last student question: "{last_question}"
Last tutor answer: "{last_answer}"

First, briefly state your PLAN (1 sentence), then call the most appropriate tool."""

    system_prompt = _build_system_prompt(memory_context)
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": situation},
    ]

    actions: list[dict] = []
    plan_text = ""
    final_tool = "do_nothing"
    final_modality = "text"
    final_reasoning = ""
    final_action_data: dict = {}

    def available_tools():
        return [
            t for t in TOOLS
            if tools_used.count(t["function"]["name"]) < 2
            or t["function"]["name"] == "do_nothing"
        ]

    client = _get_client()

    for iteration in range(MAX_ITERATIONS):
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=available_tools(),
            tool_choice="required",
            max_tokens=700,
            temperature=0.2,
        )

        assistant_msg = response.choices[0].message
        if iteration == 0 and assistant_msg.content:
            plan_text = assistant_msg.content.strip()

        if not assistant_msg.tool_calls:
            break

        tool_call = assistant_msg.tool_calls[0]
        tool_name = tool_call.function.name
        try:
            tool_args = json.loads(tool_call.function.arguments)
        except Exception:
            tool_args = {}

        reasoning = tool_args.get("reason", "")
        observation = _execute_tool(tool_name, tool_args)

        action_data: dict = {}
        if tool_name == "simplify_text":
            action_data["simplified_explanation"] = tool_args.get("simplified_explanation", "")
        elif tool_name == "explain_steps":
            action_data["steps"] = tool_args.get("step_by_step", [])
        elif tool_name == "use_analogy":
            action_data["analogy"] = tool_args.get("analogy_explanation", "")
        elif tool_name == "check_prerequisite":
            action_data["prerequisite"] = tool_args.get("prerequisite_concept", "")
            action_data["check_question"] = tool_args.get("check_question", "")
        elif tool_name == "generate_visual":
            action_data["visual_description"] = tool_args.get("visual_description", "")
        elif tool_name == "notify_parent":
            action_data["topic"] = tool_args.get("topic_struggling_with", subject)

        actions.append({
            "iteration": iteration + 1,
            "tool_called": tool_name,
            "tool_emoji": TOOL_EMOJI.get(tool_name, "🤖"),
            "reasoning": reasoning,
            "action_data": action_data,
            "observation": observation.get("message", ""),
        })

        if tool_name != "do_nothing":
            tools_used = [*tools_used, tool_name]

        final_tool = tool_name
        final_modality = TOOL_TO_MODALITY.get(tool_name, "text")
        final_reasoning = reasoning
        final_action_data = action_data

        if tool_name in TERMINAL_TOOLS:
            break

        messages.append({"role": "assistant", "content": assistant_msg.content, "tool_calls": [
            {"id": tool_call.id, "type": "function",
             "function": {"name": tool_name, "arguments": tool_call.function.arguments}}
        ]})
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(observation),
        })
        messages.append({
            "role": "user",
            "content": "Observation received. Is one more action needed, or call do_nothing if satisfied.",
        })

    # Record to memory
    try:
        record_tool_outcome(
            email=user_email, subject=subject,
            tool_name=final_tool, modality=final_modality,
            resolved=understood, topic=topic_hint,
        )
    except Exception:
        pass

    duration_ms = int((time.time() - start) * 1000)

    return {
        "emotion": emotion,
        "confidence": confidence,
        "understood": understood,
        "description": description,
        "plan": plan_text,
        "actions": actions,
        "iterations": len(actions),
        "tool_called": final_tool,
        "tool_emoji": TOOL_EMOJI.get(final_tool, "🤖"),
        "reasoning": final_reasoning,
        "modality": final_modality,
        "action_data": final_action_data,
        "tools_used_this_session": tools_used,
        "memory_context": memory_context,
        "duration_ms": duration_ms,
    }

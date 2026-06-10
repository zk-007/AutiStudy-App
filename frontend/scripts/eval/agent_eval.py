"""
Routing accuracy + response consistency for the ReAct teaching agent.
=====================================================================

System under test:
  ../AutiStudy/utils/media_agent.py — the GPT-4o tool-calling agent that picks
  ONE teaching action (do_nothing / simplify_text / generate_visual /
  speak_aloud / explain_steps / use_analogy / check_prerequisite /
  notify_parent) from the student's emotion + confusion state.

We reuse the agent's REAL building blocks (its tool schema, system prompt,
model, temperature and tool-filtering rule) but drive it with controlled,
gold-labeled situations so the routing decision is isolated and reproducible.
Cross-session memory is held at the neutral "first session" default so a
scenario's input is identical on every repeat (otherwise the recorded outcome
from run #1 would change the input for run #2 and pollute the consistency
measurement).

Two metrics, from the SAME repeated runs:
  * Routing accuracy   — does the agent pick the correct action?
      - strict : majority decision == expected_primary
      - lenient: majority decision in the accepted set
  * Response consistency — for identical input repeated k times, how stable is
      the decision? (mean majority agreement, all-agree rate, Fleiss' kappa,
      normalized entropy)

Run from the AutiStudy-React project root:
  python scripts/eval/agent_eval.py --k 5
Outputs:
  scripts/eval/results/agent_eval.json
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REACT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REACT_ROOT.parent / "backend"
DATASET = Path(__file__).resolve().parent / "datasets" / "agent_scenarios_gold.json"
RESULTS = Path(__file__).resolve().parent / "results" / "agent_eval.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))  # metrics
sys.path.insert(0, str(BACKEND_ROOT))                      # utils.media_agent

import metrics  # noqa: E402

NEUTRAL_MEMORY = "No memory yet — this is the student's first session."


def _ensure_api_key() -> bool:
    """Make sure OPENAI_API_KEY is set; fall back to ../AutiStudy secrets.toml."""
    import os

    if os.getenv("OPENAI_API_KEY"):
        return True
    secrets_path = BACKEND_ROOT / "config" / "secrets.toml"
    if not secrets_path.exists():
        secrets_path = BACKEND_ROOT / ".streamlit" / "secrets.toml"
    if secrets_path.exists():
        try:
            import toml

            secrets = toml.load(str(secrets_path))
            key = secrets.get("OPENAI_API_KEY", "")
            if key:
                os.environ["OPENAI_API_KEY"] = key
                return True
        except Exception as err:
            print(f"[agent_eval] could not read secrets.toml: {err}")
    return False


def _build_situation(s: dict) -> str:
    """Recreate the situation message used by media_agent.decide_from_emotion."""
    tools_used = s.get("tools_used_this_session") or []
    return f"""Current student situation (emotion detected by MediaPipe in real-time):
- Grade {s['grade']} | Subject: {s['subject']}
- Emotion: {s['emotion']} ({s['confidence']:.0%} confidence) — {s['description']}
- Understood: {s['understood']}
- Confused reads in a row: {s['consecutive_confused']}
- Tools already used this topic: {tools_used if tools_used else 'none'}

Last student question: "{s['last_question']}"
Last tutor answer: "..."

First, briefly state your PLAN (1 sentence), then call the most appropriate tool."""


def agent_route(s: dict, client) -> str:
    """Single routing decision: return the tool name the agent picks first.

    Mirrors media_agent's first ReAct step (model, temperature, tool schema and
    the 'used 2+ times' filter) without DB / memory side-effects.
    """
    from utils.media_agent import TOOLS, _build_system_prompt

    tools_used = s.get("tools_used_this_session") or []

    def available_tools():
        return [
            t for t in TOOLS
            if tools_used.count(t["function"]["name"]) < 2
            or t["function"]["name"] == "do_nothing"
        ]

    messages = [
        {"role": "system", "content": _build_system_prompt(NEUTRAL_MEMORY)},
        {"role": "user", "content": _build_situation(s)},
    ]
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=available_tools(),
        tool_choice="required",
        max_tokens=700,
        temperature=0.2,
    )
    msg = response.choices[0].message
    if not msg.tool_calls:
        return "do_nothing"
    return msg.tool_calls[0].function.name


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, default=5, help="repeats per scenario")
    parser.add_argument("--dry-run", action="store_true",
                        help="don't call the API; emit dataset stats only")
    args = parser.parse_args()

    data = json.loads(DATASET.read_text(encoding="utf-8"))
    scenarios = data["scenarios"]

    if args.dry_run:
        print(f"[dry-run] {len(scenarios)} scenarios, k={args.k} "
              f"=> {len(scenarios) * args.k} model calls")
        for s in scenarios:
            print(f"  {s['id']:<24} expected={s['expected_primary']:<18} "
                  f"accepted={s['accepted']}")
        return

    if not _ensure_api_key():
        print("ERROR: no OPENAI_API_KEY found (env or backend/config/secrets.toml).")
        sys.exit(1)

    from utils.media_agent import _get_client

    client = _get_client()

    per_scenario: list[dict] = []
    runs_per_item: list[list[str]] = []
    majority_decisions: list[str] = []
    accepted_sets: list[list[str]] = []
    expected_primary: list[str] = []

    t0 = time.time()
    for s in scenarios:
        runs: list[str] = []
        for _ in range(args.k):
            try:
                runs.append(agent_route(s, client))
            except Exception as err:
                print(f"[agent_eval] call failed for {s['id']}: {err}")
                runs.append("ERROR")
        cons = metrics.per_item_consistency([runs])[0]
        majority = cons["majority_choice"]

        per_scenario.append({
            "id": s["id"],
            "expected_primary": s["expected_primary"],
            "accepted": s["accepted"],
            "runs": runs,
            "majority_choice": majority,
            "majority_agreement": cons["majority_agreement"],
            "all_agree": bool(cons["all_agree"]),
            "entropy": cons["entropy"],
            "correct_strict": majority == s["expected_primary"],
            "correct_lenient": majority in set(s["accepted"]),
        })
        runs_per_item.append(runs)
        majority_decisions.append(majority)
        accepted_sets.append(s["accepted"])
        expected_primary.append(s["expected_primary"])
        print(f"  {s['id']:<24} runs={runs} -> majority={majority} "
              f"(exp {s['expected_primary']})")

    elapsed = time.time() - t0

    # ── Routing accuracy (on the majority decision per scenario) ────────────
    strict_acc = metrics.accuracy(expected_primary, majority_decisions)
    lenient_acc = metrics.lenient_accuracy(majority_decisions, accepted_sets)
    per_class = metrics.per_class_prf(expected_primary, majority_decisions)
    agg = metrics.macro_weighted(per_class)
    labels, matrix = metrics.confusion_matrix(expected_primary, majority_decisions)

    # ── Response consistency (across the k repeats) ─────────────────────────
    consistency = metrics.consistency_summary(runs_per_item)

    result = {
        "system_under_test": "utils.media_agent (GPT-4o ReAct tool router)",
        "model": "gpt-4o", "temperature": 0.2,
        "n_scenarios": len(scenarios), "k_repeats": args.k,
        "total_model_calls": len(scenarios) * args.k,
        "elapsed_seconds": round(elapsed, 1),
        "routing_accuracy": {
            "strict_primary": strict_acc,
            "lenient_accepted_set": lenient_acc,
            "macro": agg["macro"],
            "weighted": agg["weighted"],
            "per_class": per_class,
            "confusion_matrix": {"labels": labels, "matrix": matrix},
        },
        "response_consistency": consistency,
        "per_scenario": per_scenario,
    }

    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(result, indent=2), encoding="utf-8")

    # ── Console report ──────────────────────────────────────────────────────
    print("=" * 64)
    print("REACT TEACHING AGENT — ROUTING ACCURACY & CONSISTENCY")
    print("=" * 64)
    print(f"Scenarios x repeats  : {len(scenarios)} x {args.k} "
          f"= {len(scenarios) * args.k} calls  ({elapsed:.0f}s)")
    print(f"Routing accuracy     : strict {strict_acc:.1%} | "
          f"lenient {lenient_acc:.1%}")
    print(f"Macro F1 (strict)    : {agg['macro']['f1']:.3f}")
    print("-" * 64)
    print("Response consistency (same input, k repeats):")
    print(f"  mean majority agreement : {consistency['mean_majority_agreement']:.1%}")
    print(f"  all-{args.k}-agree rate       : {consistency['all_agree_rate']:.1%}")
    print(f"  Fleiss' kappa           : {consistency['fleiss_kappa']:.3f}")
    print(f"  mean entropy (0=stable) : {consistency['mean_entropy']:.3f}")
    print("=" * 64)
    print(f"Saved: {RESULTS}")


if __name__ == "__main__":
    main()

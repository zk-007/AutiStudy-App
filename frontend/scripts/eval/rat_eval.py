"""
RAT evaluation — Solution Correctness + Step Accuracy by grade.
===============================================================

Runs the RAT pipeline (CoT → multi-query retrieval → step verification →
final answer) on gold procedural maths questions for Grades 4–7.

Metrics (per grade):
  * Solution Correctness — fraction of items whose final answer matches gold
  * Step Accuracy         — fraction of CoT steps verified without correction

Run from AutiStudy-App/frontend/:
  python scripts/eval/rat_eval.py
  python scripts/eval/rat_eval.py --grade 4

Output:
  scripts/eval/results/rat_eval.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from difflib import SequenceMatcher
from fractions import Fraction
from pathlib import Path

REACT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REACT_ROOT.parent / "backend"
DATASET = Path(__file__).resolve().parent / "datasets" / "rat_math_gold.json"
RESULTS = Path(__file__).resolve().parent / "results" / "rat_eval.json"

sys.path.insert(0, str(BACKEND_ROOT))

from utils.rag import (  # noqa: E402
    _llm_chat,
    get_doc_id_for_grade,
    rat_generate_initial_cot,
    rat_retrieve_with_thoughts,
    rat_verify_step,
)


def _ensure_api_key() -> bool:
    if os.getenv("OPENAI_API_KEY"):
        return True
    secrets_path = BACKEND_ROOT / "config" / "secrets.toml"
    if not secrets_path.exists():
        secrets_path = BACKEND_ROOT / ".streamlit" / "secrets.toml"
    if secrets_path.exists():
        try:
            import toml

            key = toml.load(str(secrets_path)).get("OPENAI_API_KEY", "")
            if key:
                os.environ["OPENAI_API_KEY"] = key
                return True
        except Exception as err:
            print(f"[rat_eval] could not read secrets.toml: {err}")
    return False


def _normalize_text(s: str) -> str:
    s = (s or "").lower().strip()
    # Strip LaTeX delimiters and \frac{a}{b} → a/b
    s = re.sub(r"\\[\(\)]", "", s)
    s = re.sub(r"\\frac\{([^}]+)\}\{([^}]+)\}", r"\1/\2", s)
    s = re.sub(r"\s+", " ", s)
    s = s.replace("×", "x").replace("÷", "/")
    return s


def _extract_numbers(s: str) -> list[str]:
    """Pull numeric tokens (int, decimal, fraction, ratio) from text."""
    s = _normalize_text(s)
    tokens: list[str] = []
    for m in re.finditer(r"-?\d+(?:\.\d+)?(?:/\d+)?(?::\d+)?", s):
        tokens.append(m.group(0))
    return tokens


def _to_float(token: str) -> float | None:
    token = token.strip()
    if ":" in token:
        parts = token.split(":")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return float(parts[0]) / float(parts[1])
        return None
    if "/" in token:
        try:
            return float(Fraction(token))
        except (ValueError, ZeroDivisionError):
            return None
    try:
        return float(token)
    except ValueError:
        return None


def answers_match(expected: str, predicted: str) -> bool:
    exp = _normalize_text(expected)
    pred = _normalize_text(predicted)
    if not pred:
        return False
    if exp in pred or pred in exp:
        return True

    exp_nums = _extract_numbers(exp)
    pred_nums = _extract_numbers(pred)
    if exp_nums and pred_nums:
        ef = _to_float(exp_nums[-1])
        pf = _to_float(pred_nums[-1])
        if ef is not None and pf is not None and abs(ef - pf) < 1e-6:
            return True

    # ratio answers like 2:3
    if ":" in exp:
        exp_parts = exp.replace(" ", "").split(":")
        pred_ratio = re.search(r"(\d+)\s*:\s*(\d+)", pred)
        if pred_ratio and len(exp_parts) == 2:
            return exp_parts[0] == pred_ratio.group(1) and exp_parts[1] == pred_ratio.group(2)

    return SequenceMatcher(None, exp, pred).ratio() >= 0.85


def step_is_accurate(original: str, verified: str) -> bool:
    o = _normalize_text(original)
    v = _normalize_text(verified)
    if not o or not v:
        return False
    if o == v or o in v:
        return True

    wrong_markers = (
        "incorrect", "wrong", "mistake", "error", "should be",
        "not correct", "let's correct", "must correct", "i must correct",
        "however, i must", "you're not",
    )
    if any(m in v for m in wrong_markers):
        return False

    correct_markers = (
        "step is correct", "given step is correct", "reasoning step is correct",
        "this is correct", "this step is correct", "remains the same",
        "correct step remains",
    )
    if any(m in v for m in correct_markers):
        return True

    if len(v) > len(o) * 2.5:
        return False

    return SequenceMatcher(None, o, v).ratio() >= 0.55


def rat_pipeline(question: str, doc_id: str) -> tuple[list[str], list[str], list[dict]]:
    cot = rat_generate_initial_cot(question)
    hits = rat_retrieve_with_thoughts(question, cot, doc_id=doc_id)
    steps = [s for s in cot.split("\n") if s.strip()]
    verified: list[str] = []
    for step in steps:
        verified.append(rat_verify_step(question, step, hits))
    return steps, verified, hits


def generate_final_answer(question: str, verified_steps: list[str], hits: list[dict]) -> str:
    context = "\n".join(h.get("text", "")[:400] for h in hits[:3])
    steps_text = "\n".join(f"- {s}" for s in verified_steps[:8])
    prompt = f"""Question: {question}

Verified reasoning steps:
{steps_text}

Textbook context:
{context[:1200]}

State ONLY the final answer (number, decimal, or fraction like 3/4).
No explanation."""
    return _llm_chat("", prompt, 40).strip()


def evaluate_item(item: dict, grade: int, doc_id: str) -> dict:
    query = item["query"]
    expected = item["expected_answer"]

    t0 = time.time()
    original_steps, verified_steps, hits = rat_pipeline(query, doc_id)

    step_total = len(original_steps)
    step_correct = sum(
        1 for o, v in zip(original_steps, verified_steps) if step_is_accurate(o, v)
    )
    step_accuracy = (step_correct / step_total) if step_total else 0.0

    predicted = generate_final_answer(query, verified_steps, hits)
    solution_correct = answers_match(expected, predicted)

    return {
        "id": item["id"],
        "query": query,
        "expected_answer": expected,
        "predicted_answer": predicted,
        "solution_correct": solution_correct,
        "step_total": step_total,
        "step_correct": step_correct,
        "step_accuracy": round(step_accuracy, 4),
        "elapsed_s": round(time.time() - t0, 1),
    }


def summarize_grade(grade: int, items: list[dict]) -> dict:
    n = len(items)
    sol_correct = sum(1 for it in items if it["solution_correct"])
    step_total = sum(it["step_total"] for it in items)
    step_correct = sum(it["step_correct"] for it in items)
    return {
        "grade": grade,
        "items_evaluated": n,
        "solution_correctness": round(sol_correct / n, 4) if n else 0.0,
        "solution_correctness_pct": round(100 * sol_correct / n, 1) if n else 0.0,
        "step_accuracy": round(step_correct / step_total, 4) if step_total else 0.0,
        "step_accuracy_pct": round(100 * step_correct / step_total, 1) if step_total else 0.0,
        "items": items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="RAT evaluation by grade")
    parser.add_argument("--grade", type=int, choices=[4, 5, 6, 7], default=None)
    args = parser.parse_args()

    if not _ensure_api_key():
        print("[rat_eval] ERROR: OPENAI_API_KEY not found.")
        sys.exit(1)

    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    grades = [args.grade] if args.grade else [4, 5, 6, 7]

    print(f"[rat_eval] Evaluating grades: {grades}")
    by_grade: dict[str, dict] = {}
    t0 = time.time()

    for grade in grades:
        doc_id = get_doc_id_for_grade(grade, "Maths")
        items_raw = dataset["grades"][str(grade)]
        print(f"\n--- Grade {grade} (doc_id={doc_id}, {len(items_raw)} items) ---")
        item_results: list[dict] = []
        for item in items_raw:
            print(f"  {item['id']}: {item['query'][:50]}...")
            result = evaluate_item(item, grade, doc_id)
            item_results.append(result)
            mark = "OK" if result["solution_correct"] else "MISS"
            print(
                f"    -> solution={mark} ({result['predicted_answer']!r} vs "
                f"{result['expected_answer']!r}) | steps="
                f"{result['step_correct']}/{result['step_total']} "
                f"({result['step_accuracy']*100:.0f}%) | {result['elapsed_s']}s"
            )
        by_grade[str(grade)] = summarize_grade(grade, item_results)

    summary_rows = [
        {
            "grade": int(g),
            "solution_correctness_pct": by_grade[g]["solution_correctness_pct"],
            "step_accuracy_pct": by_grade[g]["step_accuracy_pct"],
        }
        for g in sorted(by_grade, key=int)
    ]

    output = {
        "system_under_test": "RAT (Retrieval-Augmented Thought) — utils/rag.py",
        "metrics": {
            "solution_correctness": "Fraction of gold items whose final answer matches expected",
            "step_accuracy": "Fraction of CoT steps verified without correction",
        },
        "by_grade": by_grade,
        "summary_table": summary_rows,
        "elapsed_s": round(time.time() - t0, 1),
    }

    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"\n[rat_eval] Saved: {RESULTS}")
    print("\nSummary:")
    print(f"{'Grade':<8}{'Solution Correctness':<22}{'Step Accuracy'}")
    for row in summary_rows:
        print(
            f"{row['grade']:<8}"
            f"{row['solution_correctness_pct']}%{'':<16}"
            f"{row['step_accuracy_pct']}%"
        )


if __name__ == "__main__":
    main()

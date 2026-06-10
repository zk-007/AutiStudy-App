"""
Routing-accuracy evaluation for the deterministic visual-aid router.
====================================================================

System under test:
  ../AutiStudy/utils/visual_aids.py :: classify_visual_request(question, history, subject)

This router is pure regex (no LLM, no API key, zero cost) so the evaluation is
100% reproducible. We feed it a gold-labeled set of student questions and
measure how often it routes each question to the pedagogically-correct track.

Metrics reported:
  * Overall routing accuracy
  * Per-class precision / recall / F1 (+ macro and weighted means)
  * Confusion matrix
  * Response consistency note (deterministic -> 1.0 by construction; verified
    by routing every question twice and confirming identical output)

Run from the AutiStudy-React project root:
  python scripts/eval/router_eval.py
Outputs:
  scripts/eval/results/router_eval.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REACT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = REACT_ROOT.parent / "backend"
DATASET = Path(__file__).resolve().parent / "datasets" / "visual_router_gold.json"
RESULTS = Path(__file__).resolve().parent / "results" / "router_eval.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))  # metrics
sys.path.insert(0, str(BACKEND_ROOT))                      # utils.visual_aids

import metrics  # noqa: E402


def load_dataset() -> list[dict]:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    return data["items"]


def main() -> None:
    from utils.visual_aids import classify_visual_request

    items = load_dataset()
    y_true: list[str] = []
    y_pred: list[str] = []
    failures: list[dict] = []
    deterministic = True

    for it in items:
        gold = it["expected_track"]
        pred = classify_visual_request(it["question"], None, it.get("subject", ""))
        # Verify determinism: routing the same input twice must agree.
        pred2 = classify_visual_request(it["question"], None, it.get("subject", ""))
        if pred != pred2:
            deterministic = False
        y_true.append(gold)
        y_pred.append(pred)
        if pred != gold:
            failures.append(
                {"question": it["question"], "expected": gold, "predicted": pred}
            )

    acc = metrics.accuracy(y_true, y_pred)
    per_class = metrics.per_class_prf(y_true, y_pred)
    agg = metrics.macro_weighted(per_class)
    labels, matrix = metrics.confusion_matrix(y_true, y_pred)

    result = {
        "system_under_test": "utils.visual_aids.classify_visual_request",
        "router_type": "deterministic (regex, no LLM)",
        "n_items": len(items),
        "routing_accuracy": acc,
        "macro": agg["macro"],
        "weighted": agg["weighted"],
        "per_class": per_class,
        "confusion_matrix": {"labels": labels, "matrix": matrix},
        "response_consistency": {
            "note": "Router is deterministic; identical input -> identical route.",
            "verified_identical_on_repeat": deterministic,
            "agreement_rate": 1.0 if deterministic else 0.0,
        },
        "failures": failures,
    }

    RESULTS.parent.mkdir(parents=True, exist_ok=True)
    RESULTS.write_text(json.dumps(result, indent=2), encoding="utf-8")

    # ── Console report ──────────────────────────────────────────────────────
    print("=" * 64)
    print("VISUAL-AID ROUTER — ROUTING ACCURACY")
    print("=" * 64)
    print(f"Items evaluated      : {len(items)}")
    print(f"Routing accuracy     : {acc:.1%}  ({len(items) - len(failures)}/{len(items)})")
    print(f"Macro F1             : {agg['macro']['f1']:.3f}")
    print(f"Weighted F1          : {agg['weighted']['f1']:.3f}")
    print(f"Deterministic (k=2)  : {deterministic}  -> response consistency = 100%")
    print("-" * 64)
    print(f"{'track':<16}{'prec':>7}{'rec':>7}{'f1':>7}{'n':>5}")
    for label in sorted(per_class):
        s = per_class[label]
        print(f"{label:<16}{s['precision']:>7.2f}{s['recall']:>7.2f}{s['f1']:>7.2f}{int(s['support']):>5}")
    if failures:
        print("-" * 64)
        print("Misroutes:")
        for f in failures:
            print(f"  [{f['expected']} -> {f['predicted']}]  {f['question']}")
    print("=" * 64)
    print(f"Saved: {RESULTS}")


if __name__ == "__main__":
    main()

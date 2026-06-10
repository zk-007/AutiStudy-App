"""
Shared, dependency-free evaluation metrics for AutiStudy agent evaluation.
============================================================================

Pure Python (no numpy / sklearn) so the eval runs anywhere the backend runs.

Two metric families:

  * Routing accuracy  — how often the agent routes an input to the correct
    branch/tool. Includes overall accuracy and per-class precision / recall /
    F1 (macro + weighted) plus a confusion matrix.

  * Response consistency — given the SAME input repeated k times, how stable
    is the agent's decision. Includes per-item majority agreement, exact
    all-agree rate, normalized entropy, and Fleiss' kappa.
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Dict, List, Sequence, Tuple


# ─────────────────────────────────────────────────────────────────────────────
# Routing accuracy
# ─────────────────────────────────────────────────────────────────────────────

def accuracy(y_true: Sequence[str], y_pred: Sequence[str]) -> float:
    """Fraction of predictions that exactly match the gold label."""
    if not y_true:
        return 0.0
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    return correct / len(y_true)


def lenient_accuracy(
    y_pred: Sequence[str], accepted: Sequence[Sequence[str]]
) -> float:
    """Fraction of predictions that fall inside the per-item accepted set.

    Used for the LLM agent where more than one tool is a defensible route
    (e.g. first confusion → simplify_text OR use_analogy).
    """
    if not y_pred:
        return 0.0
    hits = sum(1 for p, acc in zip(y_pred, accepted) if p in set(acc))
    return hits / len(y_pred)


def per_class_prf(
    y_true: Sequence[str], y_pred: Sequence[str]
) -> Dict[str, Dict[str, float]]:
    """Per-class precision / recall / F1 / support."""
    labels = sorted(set(y_true) | set(y_pred))
    out: Dict[str, Dict[str, float]] = {}
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)
        support = sum(1 for t in y_true if t == label)
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall)
            else 0.0
        )
        out[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": support,
        }
    return out


def macro_weighted(
    per_class: Dict[str, Dict[str, float]]
) -> Dict[str, Dict[str, float]]:
    """Aggregate per-class scores into macro (unweighted) and weighted means."""
    if not per_class:
        return {"macro": {}, "weighted": {}}
    labels = list(per_class)
    total_support = sum(per_class[l]["support"] for l in labels) or 1
    macro = {
        m: sum(per_class[l][m] for l in labels) / len(labels)
        for m in ("precision", "recall", "f1")
    }
    weighted = {
        m: sum(per_class[l][m] * per_class[l]["support"] for l in labels)
        / total_support
        for m in ("precision", "recall", "f1")
    }
    return {"macro": macro, "weighted": weighted}


def confusion_matrix(
    y_true: Sequence[str], y_pred: Sequence[str]
) -> Tuple[List[str], List[List[int]]]:
    """Return (labels, matrix) where matrix[i][j] = count of true=i predicted=j."""
    labels = sorted(set(y_true) | set(y_pred))
    index = {l: i for i, l in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for t, p in zip(y_true, y_pred):
        matrix[index[t]][index[p]] += 1
    return labels, matrix


# ─────────────────────────────────────────────────────────────────────────────
# Response consistency
# ─────────────────────────────────────────────────────────────────────────────

def _normalized_entropy(choices: Sequence[str]) -> float:
    """Shannon entropy of the choice distribution, normalized to [0, 1].

    0.0 = perfectly consistent (always the same choice).
    1.0 = maximally inconsistent (uniform over the observed choices).
    """
    n = len(choices)
    if n <= 1:
        return 0.0
    counts = Counter(choices)
    entropy = -sum((c / n) * math.log2(c / n) for c in counts.values())
    max_entropy = math.log2(len(counts)) if len(counts) > 1 else 1.0
    return entropy / max_entropy if max_entropy else 0.0


def per_item_consistency(
    runs_per_item: Sequence[Sequence[str]],
) -> List[Dict[str, float]]:
    """For each item (a list of k repeated decisions) compute stability stats."""
    out: List[Dict[str, float]] = []
    for runs in runs_per_item:
        k = len(runs)
        counts = Counter(runs)
        majority_choice, majority_count = counts.most_common(1)[0]
        out.append(
            {
                "k": k,
                "majority_choice": majority_choice,
                "majority_agreement": majority_count / k if k else 0.0,
                "all_agree": 1.0 if len(counts) == 1 else 0.0,
                "entropy": _normalized_entropy(runs),
                "distinct_choices": len(counts),
            }
        )
    return out


def fleiss_kappa(runs_per_item: Sequence[Sequence[str]]) -> float:
    """Fleiss' kappa across items.

    Each item is a 'subject' rated k times (the k repeated agent runs);
    each category is a possible decision. Measures agreement among the
    repeated runs beyond what chance would predict.

    Returns a value in roughly [-1, 1]; 1.0 = perfect agreement.
    """
    items = [r for r in runs_per_item if r]
    if not items:
        return 0.0
    k = len(items[0])
    if any(len(r) != k for r in items) or k < 2:
        # Unequal raters or single rating — kappa is undefined; fall back to 0.
        return 0.0

    categories = sorted({c for r in items for c in r})
    n = len(items)

    # P_i: agreement within each item
    p_i: List[float] = []
    cat_totals = {c: 0 for c in categories}
    for r in items:
        counts = Counter(r)
        for c in categories:
            cat_totals[c] += counts.get(c, 0)
        agree = sum(counts.get(c, 0) ** 2 for c in categories) - k
        p_i.append(agree / (k * (k - 1)))

    p_bar = sum(p_i) / n
    total_ratings = n * k
    p_e = sum((cat_totals[c] / total_ratings) ** 2 for c in categories)

    if p_e >= 1.0:
        return 1.0
    return (p_bar - p_e) / (1 - p_e)


def consistency_summary(
    runs_per_item: Sequence[Sequence[str]],
) -> Dict[str, float]:
    """Roll up per-item consistency into headline numbers."""
    items = per_item_consistency(runs_per_item)
    n = len(items) or 1
    return {
        "n_items": len(items),
        "k_repeats": items[0]["k"] if items else 0,
        "mean_majority_agreement": sum(i["majority_agreement"] for i in items) / n,
        "all_agree_rate": sum(i["all_agree"] for i in items) / n,
        "mean_entropy": sum(i["entropy"] for i in items) / n,
        "fleiss_kappa": fleiss_kappa(runs_per_item),
    }

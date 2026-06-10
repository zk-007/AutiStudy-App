# AutiStudy — Agent Evaluation

Evaluation of the adaptive teaching agent on the two metrics requested for
**agent evaluation**: **Routing Accuracy** and **Response Consistency**. This
complements the existing **retriever / RAT accuracy** numbers, giving a complete
evaluation story (retriever ✓, RAT ✓, agent ✓).

Two routing layers are assessed:

1. **Visual-aid router** — deterministic regex
   (`backend/utils/visual_aids.py :: classify_visual_request`) that routes a
   student question into one of 11 visual tracks.
2. **ReAct teaching agent** — GPT-4o tool-caller
   (`backend/utils/media_agent.py :: decide_from_emotion`) that picks one of
   8 teaching actions from the student's emotion + confusion state.

## How to reproduce

Run from the `AutiStudy-App/frontend/` directory:

```bash
python scripts/eval/router_eval.py            # deterministic, free, instant
python scripts/eval/agent_eval.py --k 5        # GPT-4o, needs OPENAI_API_KEY
python scripts/generate_agent_evaluation_docx.py
```

The agent eval reads the OpenAI key from the environment or, failing that, from
`backend/config/secrets.toml`. Gold datasets live in
`scripts/eval/datasets/`; raw results in `scripts/eval/results/`.

## Metrics

**Routing Accuracy** — does the agent send each input to the correct
action/branch?

- Overall accuracy (correct routes / total)
- Per-class precision / recall / F1, plus macro and weighted means (so rare
  routes are not masked by common ones)
- Confusion matrix
- For the LLM agent: *strict* (must match the single best route) and *lenient*
  (must fall inside the set of defensible routes)

**Response Consistency** — same input repeated `k` times, how stable is the
decision?

- Mean majority agreement
- All-agree rate (every repeat identical)
- Fleiss' kappa (agreement beyond chance)
- Normalized entropy (0 = perfectly stable)

## Results

### Visual-aid router (deterministic)

| Metric | Value |
| --- | --- |
| Items evaluated | 60 |
| Routing accuracy | **93.3%** (56/60) |
| Macro F1 | 0.939 |
| Weighted F1 | 0.931 |
| Response consistency | **100%** (deterministic — identical input → identical route) |

Routing-accuracy evaluation surfaced 4 genuine misroutes worth fixing:

- `"What is 2/4 + 5/6?"`, `"Solve 1/2 + 1/4."`, `"What is 0.5 + 0.25?"` →
  routed to **countable** instead of **symbolic**. The countable regex matches
  the inner `4 + 5` / `2 + 1` / `5 + 0` across the fraction/decimal boundary and,
  because countable is checked first, hijacks these sums before the symbolic
  step-card branch. (Notably, `2/4 + 5/6` is the router's own documented
  canonical symbolic example.)
- `"Illustrate the fraction 3/8."` → routed to **ratio** because the ratio
  keyword `"rate"` is a substring of `"illust-rate"`.

### ReAct teaching agent (GPT-4o, temperature 0.2)

| Metric | Value |
| --- | --- |
| Scenarios × repeats | 12 × 5 = 60 model calls |
| Routing accuracy (strict) | **91.7%** |
| Routing accuracy (lenient) | **100%** |
| Macro F1 (strict) | 0.833 |
| Mean majority agreement | **100%** |
| All-5-agree rate | **100%** |
| Fleiss' kappa | **1.000** |
| Mean entropy | 0.000 |

The single strict "miss" is the *last-resort* scenario: the agent chose
`check_prerequisite` instead of `notify_parent`. This is inside the accepted
set (notify_parent is documented as an absolute last resort), so it counts as
correct under lenient scoring and is arguably the kinder choice.

## Summary

| Component | Routing accuracy | Response consistency |
| --- | --- | --- |
| Visual-aid router (deterministic) | 93.3% | 100% (deterministic) |
| ReAct teaching agent (GPT-4o) | 91.7% strict / 100% lenient | 100% agreement, κ = 1.00 |

**Recommended headline metrics:** report **Routing Accuracy + macro F1** and
**mean majority agreement + Fleiss' kappa** for Response Consistency. These pair
naturally with the retriever/RAT accuracy already reported.

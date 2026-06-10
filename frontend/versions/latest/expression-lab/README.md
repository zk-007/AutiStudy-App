# Expression Lab — Facial Expression Benchmark

Three **independent** real-time strategies for webcam expression recognition.
Use this lab to compare accuracy before wiring the winner into the Media Agent.

## Run locally

```bash
cd AutiStudy-React
npm run dev
```

Open in browser:

| Page | URL | Strategy |
|------|-----|----------|
| **Hub** | http://localhost:3000/expression-lab | Overview + links |
| **Compare (all 3)** | http://localhost:3000/expression-lab/compare | Side-by-side on one webcam |
| **Strategy A** | http://localhost:3000/expression-lab/mediapipe | MediaPipe blendshapes + geometry |
| **Strategy B** | http://localhost:3000/expression-lab/faceapi | face-api.js CNN expression net |
| **Strategy C** | http://localhost:3000/expression-lab/hybrid | Fusion + temporal smoothing |

## Emotions detected

`happy` · `sad` · `frustrated` · `bored` · `tired` · `inattentive` · `confused` · `neutral`

All outputs are **probabilities** (0–100%), smoothed over time — not single-frame labels.

## Strategies

### A — MediaPipe Blendshapes (`strategies/mediapipe-blendshapes`)
- Google Face Landmarker: 52 blend shapes + EAR + head pose
- Rule-based classifier tuned for learning states
- ~15 FPS, fully local, no extra models beyond MediaPipe

### B — face-api.js CNN (`strategies/faceapi-cnn`)
- TinyFaceDetector + FaceExpressionNet
- Pretrained expression classifier → mapped to lab emotions
- ~2 FPS, lightweight, good on classic expressions

### C — Hybrid Fusion (`strategies/hybrid-fusion`)
- Combines MediaPipe geometry + face-api emotions
- 3-second sliding window + exponential smoothing
- Best for stable, confidence-based output (closest to production design)

## Production integration

**Strategy C (Hybrid)** is wired into live chat via `lib/agent/HybridEmotionEngine.ts` and `useAdaptiveTutorAgent`. The Expression Lab remains available for future experiments.

## Folder structure

```
expression-lab/
  types.ts
  emotions.ts
  shared/           # loaders, buffer, camera helpers
  strategies/       # A, B, C engines + classifiers
  components/       # UI panels
  hooks/            # React hooks per strategy
app/expression-lab/ # Next.js routes (deployed with main app)
```

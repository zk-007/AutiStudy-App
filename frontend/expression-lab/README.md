# Expression Lab — CV Strategy Benchmark

Compares three computer-vision strategies for engagement detection:

| Strategy | Engine |
|----------|--------|
| A | MediaPipe only |
| B | face-api.js only |
| C | Hybrid (production — used in chat) |

## Run

From the monorepo frontend folder:

```bash
cd AutiStudy-App/frontend
npm run dev
```

Open [http://localhost:3000/expression-lab](http://localhost:3000/expression-lab).

Production chat uses **Strategy C** via `lib/agent/HybridEmotionEngine.ts`.

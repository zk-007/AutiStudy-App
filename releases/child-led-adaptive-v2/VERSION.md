# AutiStudy — `child-led-adaptive-v2`

**Codename:** Child-Led Adaptive Multimodal Chat v2  
**Saved:** 2025-06-27

## What this version is

Replaces the CV-driven **“Did you get it?” popup ladder** with **👍/👎 thumbs feedback**, child-chosen modalities, silent Media Agent, and memory-based preference learning.

### New behaviour

- First login → learning-style wizard (`/onboarding/learning-style`) saves modality order to memory
- Chat banner: “👍 if understand, 👎 if not”
- First book answer uses child’s top preferred modality (text / voice / image / steps)
- 👍 → green badge, memory +3, next question allowed
- 👎 → red badge + modality picker (remaining options + “Move to next question”)
- All modalities fail → breathing → retry same Q or new Q
- Feedback required before next question (gentle animated reminder; typing allowed)
- Media Agent: observe only — no auto interventions
- Off-book questions → no feedback bar (unchanged `comprehensionGate.ts`)

### Key files (v2)

**Backend**
- `backend/utils/child_led_memory.py`
- `backend/api_server.py` — `/api/agent/learning-preferences`, `/api/agent/child-led/feedback`

**Frontend**
- `frontend/lib/hooks/useChildLedFlow.ts`
- `frontend/lib/agent/childLedTypes.ts`
- `frontend/components/child-led/*`
- `frontend/app/onboarding/learning-style/page.tsx`
- `frontend/app/chat/page.tsx` — wired to v2 flow
- `frontend/app/login/page.tsx` — onboarding redirect

### Rollback

To restore the old popup ladder:

```powershell
cd c:\Users\Zohaib\Downloads\AutiStudy-App
Copy-Item -Recurse -Force releases\pre-child-led-spec-v1\frontend\* frontend\
Copy-Item -Recurse -Force releases\pre-child-led-spec-v1\backend\* backend\
```

## Do not deploy until tested locally

User requested local testing before Railway/Vercel push.

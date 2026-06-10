# AutiStudy React + 3D Implementation Plan

## 📋 Project Overview

**Goal:** Transform AutiStudy from a Streamlit application into a modern React-based 3D website with an intelligent pedagogical agent that autonomously decides the optimal learning modality (text, image, voice) for autistic students.

**Architecture:** Separate frontend (React) and backend (FastAPI) repositories/folders, communicating via REST API and WebSockets.

---

## 🏗️ Project Structure

```
AutiStudy/                          # Existing folder (becomes backend)
├── api/                            # NEW: FastAPI backend
│   ├── main.py                     # FastAPI app entry
│   ├── routers/
│   │   ├── auth.py                 # Authentication endpoints
│   │   ├── chat.py                 # Chat/conversation endpoints
│   │   ├── agent.py                # Agent decision endpoints
│   │   ├── quiz.py                 # Quiz endpoints
│   │   └── analytics.py            # Analytics endpoints
│   ├── services/
│   │   ├── agent_service.py        # Agent logic & metrics
│   │   ├── llm_service.py          # Existing LLM logic adapted
│   │   ├── rag_service.py          # Existing RAG logic adapted
│   │   ├── image_service.py        # Image generation
│   │   ├── tts_service.py          # Text-to-speech
│   │   └── analytics_service.py    # Analytics processing
│   ├── models/
│   │   ├── user.py                 # User models
│   │   ├── chat.py                 # Chat/message models
│   │   ├── analytics.py            # Analytics event models
│   │   └── agent.py                # Agent state models
│   ├── database/
│   │   ├── connection.py           # PostgreSQL connection
│   │   ├── migrations/             # Database migrations
│   │   └── redis.py                # Redis for sessions/caching
│   └── websockets/
│       └── chat_ws.py              # WebSocket handler
│
├── utils/                          # Existing utils (to be imported by api/)
├── shared_chroma_db/               # Existing ChromaDB
└── ... (other existing files)

autistudy-frontend/                 # NEW: React frontend (separate folder)
├── src/
│   ├── components/
│   │   ├── 3d/                     # 3D components
│   │   │   ├── Avatar.tsx          # 3D tutor avatar
│   │   │   ├── ConceptModel.tsx    # 3D educational models
│   │   │   ├── Scene.tsx           # Main 3D scene
│   │   │   └── Particles.tsx       # Reward animations
│   │   ├── chat/
│   │   │   ├── ChatContainer.tsx   # Main chat interface
│   │   │   ├── MessageBubble.tsx   # Individual messages
│   │   │   ├── ImageDisplay.tsx    # Image rendering
│   │   │   ├── VoicePlayer.tsx     # Audio player
│   │   │   └── TypingIndicator.tsx # Agent typing animation
│   │   ├── quiz/
│   │   │   ├── QuizContainer.tsx   # Quiz interface
│   │   │   ├── QuestionCard.tsx    # Individual question
│   │   │   └── QuizResults.tsx     # Results display
│   │   ├── analytics/
│   │   │   ├── ProgressGraph.tsx   # Learning progress
│   │   │   ├── EngagementChart.tsx # Engagement metrics
│   │   │   └── PerformanceCard.tsx # Performance summary
│   │   ├── ui/                     # Shared UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Modal.tsx
│   │   └── layout/
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       └── Footer.tsx
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Chat.tsx
│   │   ├── Quiz.tsx
│   │   ├── Analytics.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── useAuth.ts              # Authentication hook
│   │   ├── useChat.ts              # Chat/WebSocket hook
│   │   ├── useAgent.ts             # Agent state hook
│   │   ├── useAnalytics.ts         # Analytics tracking hook
│   │   └── useScrollTracking.ts    # Scroll behavior tracking
│   ├── services/
│   │   ├── api.ts                  # API client
│   │   ├── websocket.ts            # WebSocket client
│   │   └── analytics.ts            # Analytics event sender
│   ├── store/
│   │   ├── authStore.ts            # Auth state (Zustand)
│   │   ├── chatStore.ts            # Chat state
│   │   └── analyticsStore.ts       # Analytics state
│   ├── types/
│   │   ├── user.ts
│   │   ├── chat.ts
│   │   ├── agent.ts
│   │   └── analytics.ts
│   ├── utils/
│   │   ├── constants.ts
│   │   ├── helpers.ts
│   │   └── i18n.ts                 # EN/Urdu translations
│   ├── styles/
│   │   └── globals.css             # Tailwind + custom styles
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── models/                     # 3D model files (.glb)
│   └── assets/                     # Images, icons
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 🎯 Phase 1: Backend API Layer

### 1.1 FastAPI Setup

**Goal:** Create a REST API + WebSocket server that exposes existing logic

**Tasks:**

- [ ] **1.1.1** Create `api/` folder structure
- [ ] **1.1.2** Set up FastAPI with CORS, middleware
- [ ] **1.1.3** Configure environment variables (.env)
- [ ] **1.1.4** Set up PostgreSQL connection (SQLAlchemy)
- [ ] **1.1.5** Set up Redis for sessions/caching
- [ ] **1.1.6** Create database models and migrations

**Files to Create:**
```
api/main.py
api/config.py
api/database/connection.py
api/database/redis.py
api/models/*.py
```

### 1.2 Authentication API

**Goal:** JWT-based authentication with refresh tokens

**Endpoints:**
```
POST /api/auth/register     # Create new account
POST /api/auth/login        # Login, get tokens
POST /api/auth/refresh      # Refresh access token
POST /api/auth/logout       # Invalidate tokens
GET  /api/auth/me           # Get current user
PUT  /api/auth/me           # Update profile
```

**Tasks:**

- [ ] **1.2.1** Create auth router with endpoints
- [ ] **1.2.2** Implement JWT token generation/validation
- [ ] **1.2.3** Password hashing (bcrypt)
- [ ] **1.2.4** User model with roles (student, parent, teacher)
- [ ] **1.2.5** Session management with Redis

### 1.3 Chat/Conversation API

**Goal:** Real-time chat with the intelligent agent

**Endpoints:**
```
POST /api/chat/sessions              # Create new chat session
GET  /api/chat/sessions              # List user's chat sessions
GET  /api/chat/sessions/{id}         # Get specific session
DELETE /api/chat/sessions/{id}       # Delete session

WebSocket /ws/chat/{session_id}      # Real-time chat connection
```

**WebSocket Message Types:**
```json
// Client → Server
{ "type": "user_message", "content": "What is a flower?" }
{ "type": "user_feedback", "feedback": "positive" | "negative" }
{ "type": "scroll_event", "depth": 0.85, "velocity": 120 }

// Server → Client
{ "type": "agent_message", "content": "...", "modality": "text" }
{ "type": "agent_image", "url": "...", "alt": "..." }
{ "type": "agent_voice", "audio_base64": "..." }
{ "type": "agent_question", "content": "Got it?", "expects_response": true }
{ "type": "mini_quiz", "question": "...", "options": [...] }
{ "type": "typing_start" }
{ "type": "typing_end" }
```

**Tasks:**

- [ ] **1.3.1** Create chat router with session endpoints
- [ ] **1.3.2** Implement WebSocket handler
- [ ] **1.3.3** Integrate existing LLM logic (from utils/llm.py)
- [ ] **1.3.4** Integrate existing RAG logic (from utils/rag.py)
- [ ] **1.3.5** Message persistence to PostgreSQL
- [ ] **1.3.6** Real-time message streaming

### 1.4 Agent Intelligence Service

**Goal:** The brain that decides text/image/voice based on metrics

**Agent State Model:**
```python
class AgentState:
    session_id: str
    student_id: str
    
    # Current concept being taught
    current_concept: str
    concept_chunks: List[str]  # Broken down parts
    current_chunk_index: int
    
    # Metrics (0-100 scale)
    concept_complexity_score: float      # CCS
    student_engagement_score: float      # SES
    comprehension_confidence_score: float # CompCS
    session_fatigue_index: float         # SFI
    
    # Historical (for LSAS)
    modality_effectiveness: Dict[str, float]  # {"text": 0.7, "image": 0.8, "voice": 0.6}
    
    # Conversation tracking
    exchanges_on_current_chunk: int
    positive_confirmations: int
    negative_signals: int
    last_response_time_ms: int
    
    # Decision history
    modalities_used: List[str]
```

**Agent Decision Algorithm:**
```python
def decide_response(state: AgentState, user_input: str) -> AgentResponse:
    # 1. Analyze user input
    input_analysis = analyze_input(user_input)  # sentiment, comprehension signals
    
    # 2. Update metrics
    update_engagement_score(state, input_analysis)
    update_comprehension_score(state, input_analysis)
    update_fatigue_index(state)
    
    # 3. Decide modality
    modality = select_modality(state)
    
    # 4. Decide content strategy
    if state.comprehension_confidence_score > 70:
        strategy = "advance_to_next_chunk"
    elif state.exchanges_on_current_chunk >= 3:
        strategy = "add_visual_support"
    else:
        strategy = "reinforce_current_chunk"
    
    # 5. Generate response with repetition
    response = generate_pedagogical_response(state, strategy)
    
    # 6. Decide if mini-quiz needed
    if should_quiz(state):
        append_mini_quiz(response, state.current_concept)
    
    return response
```

**Tasks:**

- [ ] **1.4.1** Create agent service with state management
- [ ] **1.4.2** Implement Concept Complexity Score (CCS) calculator
- [ ] **1.4.3** Implement Student Engagement Score (SES) tracker
- [ ] **1.4.4** Implement Comprehension Confidence Score (CompCS)
- [ ] **1.4.5** Implement Learning Style Adaptation Score (LSAS)
- [ ] **1.4.6** Implement Session Fatigue Index (SFI)
- [ ] **1.4.7** Create modality selection algorithm
- [ ] **1.4.8** Create concept chunking system
- [ ] **1.4.9** Create repetitive explanation generator
- [ ] **1.4.10** Integrate with LLM for response generation

### 1.5 Image Generation Service

**Goal:** Autism-friendly educational images

**Endpoint:**
```
POST /api/media/image
{
    "concept": "flower parts",
    "context": "teaching petals and sepals",
    "style": "educational_diagram"
}
```

**Tasks:**

- [ ] **1.5.1** Adapt existing image generation logic
- [ ] **1.5.2** Create autism-friendly prompt templates
- [ ] **1.5.3** Image caching to avoid regeneration
- [ ] **1.5.4** Fallback to pre-generated images for common concepts

### 1.6 Text-to-Speech Service

**Goal:** Patient, clear voice explanations

**Endpoint:**
```
POST /api/media/tts
{
    "text": "A flower is a part of a plant...",
    "language": "en",
    "speed": "slow"
}
```

**Tasks:**

- [ ] **1.6.1** Adapt existing TTS logic
- [ ] **1.6.2** Add speed control (slower for autistic learners)
- [ ] **1.6.3** Audio caching
- [ ] **1.6.4** Chunked audio for long text

### 1.7 Quiz Service

**Goal:** Adaptive quizzes with analytics

**Endpoints:**
```
POST /api/quiz/generate     # Generate quiz from concept
POST /api/quiz/submit       # Submit answer
GET  /api/quiz/history      # Quiz history
GET  /api/quiz/analytics    # Quiz performance analytics
```

**Tasks:**

- [ ] **1.7.1** Create quiz router
- [ ] **1.7.2** Implement quiz generation from concepts
- [ ] **1.7.3** Answer validation and scoring
- [ ] **1.7.4** Quiz persistence
- [ ] **1.7.5** Performance analytics calculation

### 1.8 Analytics Service

**Goal:** Track all learning events for insights

**Endpoints:**
```
POST /api/analytics/event    # Track event
GET  /api/analytics/summary  # Get user analytics summary
GET  /api/analytics/graphs   # Get graph data
```

**Events to Track:**
```python
class AnalyticsEvent:
    event_type: str  # message_sent, scroll, quiz_answer, etc.
    user_id: str
    session_id: str
    timestamp: datetime
    data: Dict  # Event-specific data
```

**Tasks:**

- [ ] **1.8.1** Create analytics router
- [ ] **1.8.2** Event ingestion and storage
- [ ] **1.8.3** Real-time metric calculation
- [ ] **1.8.4** Graph data aggregation
- [ ] **1.8.5** Learning progress calculation

---

## 🎨 Phase 2: React Frontend Foundation

### 2.1 Project Setup

**Goal:** Modern React project with TypeScript, Tailwind, 3D

**Tasks:**

- [ ] **2.1.1** Initialize Vite + React + TypeScript project
- [ ] **2.1.2** Install and configure Tailwind CSS
- [ ] **2.1.3** Install React Three Fiber + Drei
- [ ] **2.1.4** Install Zustand for state management
- [ ] **2.1.5** Install React Router for routing
- [ ] **2.1.6** Install Framer Motion for animations
- [ ] **2.1.7** Set up folder structure
- [ ] **2.1.8** Configure environment variables
- [ ] **2.1.9** Set up API client (axios/fetch)
- [ ] **2.1.10** Set up WebSocket client

**Dependencies:**
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "react-router-dom": "^6.x",
    "@react-three/fiber": "^8.x",
    "@react-three/drei": "^9.x",
    "three": "^0.160.x",
    "zustand": "^4.x",
    "framer-motion": "^10.x",
    "axios": "^1.x",
    "recharts": "^2.x",
    "react-hot-toast": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x",
    "@types/react": "^18.x",
    "@types/three": "^0.160.x"
  }
}
```

### 2.2 Autism-Friendly Design System

**Goal:** Calming, predictable, accessible UI

**Design Tokens:**
```typescript
const theme = {
  colors: {
    // Soft, muted palette
    primary: '#6B9BD2',      // Calming blue
    secondary: '#98D4BB',    // Soft green
    accent: '#F5C26B',       // Warm yellow
    background: '#F8FAFC',   // Light gray
    surface: '#FFFFFF',
    text: '#374151',         // Dark gray (not pure black)
    textMuted: '#6B7280',
    success: '#86EFAC',
    warning: '#FCD34D',
    error: '#FCA5A5',        // Soft red (not alarming)
  },
  fonts: {
    primary: 'Inter, system-ui, sans-serif',
    reading: 'OpenDyslexic, Comic Sans MS, sans-serif',  // Dyslexia-friendly option
  },
  spacing: {
    // Generous spacing for clarity
    xs: '0.5rem',
    sm: '1rem',
    md: '1.5rem',
    lg: '2rem',
    xl: '3rem',
  },
  animations: {
    // Slow, predictable animations
    duration: '300ms',
    easing: 'ease-in-out',
  },
  borderRadius: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    full: '9999px',
  }
}
```

**Accessibility Features:**
- High contrast mode toggle
- Font size adjustment
- Animation disable option
- Screen reader optimized
- Keyboard navigation
- Focus indicators

**Tasks:**

- [ ] **2.2.1** Create design token constants
- [ ] **2.2.2** Configure Tailwind with custom theme
- [ ] **2.2.3** Create base UI components (Button, Card, Input)
- [ ] **2.2.4** Add accessibility settings context
- [ ] **2.2.5** Implement high contrast mode
- [ ] **2.2.6** Add font size controls
- [ ] **2.2.7** Add animation toggle

### 2.3 Authentication Flow

**Goal:** Simple, reassuring login/signup

**Pages:**
- Landing page with clear call-to-action
- Login page with email/password
- Signup page with step-by-step form
- Password reset flow

**Tasks:**

- [ ] **2.3.1** Create auth context/store
- [ ] **2.3.2** Implement useAuth hook
- [ ] **2.3.3** Create Landing page
- [ ] **2.3.4** Create Login page
- [ ] **2.3.5** Create Signup page (multi-step)
- [ ] **2.3.6** Implement protected routes
- [ ] **2.3.7** Token storage and refresh logic
- [ ] **2.3.8** Logout functionality

### 2.4 Dashboard

**Goal:** Welcoming, clear overview of learning journey

**Sections:**
- Welcome message with 3D avatar
- Quick actions (Start Learning, Take Quiz)
- Progress summary cards
- Recent subjects
- Achievement badges

**Tasks:**

- [ ] **2.4.1** Create Dashboard page layout
- [ ] **2.4.2** Create welcome header with avatar
- [ ] **2.4.3** Create quick action buttons
- [ ] **2.4.4** Create progress cards
- [ ] **2.4.5** Create subject selection cards
- [ ] **2.4.6** Create achievements display
- [ ] **2.4.7** Add navigation sidebar

### 2.5 Routing Structure

```typescript
const routes = [
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  
  // Protected routes
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/chat', element: <Chat /> },
  { path: '/chat/:sessionId', element: <Chat /> },
  { path: '/quiz', element: <Quiz /> },
  { path: '/analytics', element: <Analytics /> },
  { path: '/settings', element: <Settings /> },
]
```

**Tasks:**

- [ ] **2.5.1** Set up React Router
- [ ] **2.5.2** Create route configuration
- [ ] **2.5.3** Implement protected route wrapper
- [ ] **2.5.4** Add navigation components

---

## 💬 Phase 3: Intelligent Agent Chat

### 3.1 Chat Interface

**Goal:** Conversational UI optimized for autistic learners

**Layout:**
```
┌─────────────────────────────────────────┐
│  [← Back]    Learning Chat    [Settings]│
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │       3D Avatar (animated)       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Agent: A flower is a part of a  │   │
│  │ plant. 🌸                        │   │
│  │                                  │   │
│  │ [🔊 Listen]  [📷 See Image]      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ You: Yes, I understand          │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Agent: Great! So a flower is    │   │
│  │ the part of... ?                 │   │
│  │                                  │   │
│  │ [Plant 🌱] [Animal 🐕] [Rock 🪨] │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│  [Type your message...        ] [Send]  │
│  [Quick: Yes ✓] [No ✗] [Explain more]  │
└─────────────────────────────────────────┘
```

**Tasks:**

- [ ] **3.1.1** Create ChatContainer component
- [ ] **3.1.2** Create MessageBubble component (supports text/image/voice)
- [ ] **3.1.3** Create 3D avatar placeholder in chat
- [ ] **3.1.4** Create message input with quick responses
- [ ] **3.1.5** Create typing indicator
- [ ] **3.1.6** Implement smooth auto-scroll
- [ ] **3.1.7** Create mini-quiz inline component

### 3.2 WebSocket Integration

**Goal:** Real-time bidirectional communication

**Tasks:**

- [ ] **3.2.1** Create WebSocket service
- [ ] **3.2.2** Implement connection management (connect, reconnect, disconnect)
- [ ] **3.2.3** Create useChat hook
- [ ] **3.2.4** Handle incoming messages (text, image, voice, quiz)
- [ ] **3.2.5** Send user messages and events
- [ ] **3.2.6** Implement message queuing for offline resilience

### 3.3 Multimodal Rendering

**Goal:** Seamlessly render text, images, voice

**Text Rendering:**
- Chunked display (reveal sentence by sentence)
- Highlight current focus
- Large, readable font

**Image Rendering:**
- Smooth fade-in
- Pinch-to-zoom on mobile
- Alt text always visible
- Optional fullscreen

**Voice Rendering:**
- Inline audio player
- Play/pause controls
- Speed adjustment
- Visual waveform

**Tasks:**

- [ ] **3.3.1** Create TextDisplay component with chunked reveal
- [ ] **3.3.2** Create ImageDisplay component with zoom
- [ ] **3.3.3** Create VoicePlayer component
- [ ] **3.3.4** Create MiniQuiz component
- [ ] **3.3.5** Integrate modalities into MessageBubble

### 3.4 Engagement Tracking

**Goal:** Track scroll, time, interactions for agent metrics

**Tracked Events:**
- Scroll depth (how far user scrolled)
- Scroll velocity (how fast)
- Time on message (how long viewing each)
- Click/tap interactions
- Response time (time to reply)

**Tasks:**

- [ ] **3.4.1** Create useScrollTracking hook
- [ ] **3.4.2** Create useEngagement hook
- [ ] **3.4.3** Send events to backend via WebSocket
- [ ] **3.4.4** Implement debouncing for performance

---

## 🎮 Phase 4: 3D Components

### 4.1 3D Avatar (Tutor Character)

**Goal:** Friendly, animated tutor that feels like a companion

**Features:**
- Idle animation (subtle breathing, blinking)
- Speaking animation (mouth movement, gestures)
- Emotions (happy, encouraging, thinking)
- Wave/greeting when user arrives
- Celebration on achievements

**Tasks:**

- [ ] **4.1.1** Design or acquire 3D avatar model (.glb)
- [ ] **4.1.2** Create Avatar component with React Three Fiber
- [ ] **4.1.3** Implement idle animations
- [ ] **4.1.4** Implement speaking animations
- [ ] **4.1.5** Add emotion states
- [ ] **4.1.6** Connect to chat state (speak when agent talks)

### 4.2 3D Concept Models

**Goal:** Interactive 3D models for visual learning

**Examples:**
- Flower with labeled parts (rotatable)
- Solar system
- Geometric shapes
- Simple machines

**Tasks:**

- [ ] **4.2.1** Create ConceptModel component
- [ ] **4.2.2** Implement model loading and display
- [ ] **4.2.3** Add rotation controls (drag to rotate)
- [ ] **4.2.4** Add labels that follow model parts
- [ ] **4.2.5** Create library of common educational models

### 4.3 Reward Animations

**Goal:** Celebrate achievements with satisfying visuals

**Animations:**
- Star burst on correct answer
- Confetti on quiz completion
- Badge reveal animation
- Progress milestone celebration

**Tasks:**

- [ ] **4.3.1** Create Particles component
- [ ] **4.3.2** Create star burst effect
- [ ] **4.3.3** Create confetti effect
- [ ] **4.3.4** Create badge reveal animation
- [ ] **4.3.5** Integrate with quiz and progress systems

---

## 📊 Phase 5: Quiz & Analytics

### 5.1 Quiz System

**Goal:** Adaptive quizzes that reinforce learning

**Quiz Flow:**
1. Agent completes concept explanation
2. Agent asks if ready for quiz
3. 3-5 questions generated from concept
4. Immediate feedback per question
5. Summary with score and stars
6. Retry option for missed questions

**Question Types:**
- Multiple choice (tap to select)
- Fill in blank (complete the sentence)
- True/False
- Match pairs (drag and drop)

**Tasks:**

- [ ] **5.1.1** Create QuizContainer component
- [ ] **5.1.2** Create QuestionCard for each type
- [ ] **5.1.3** Create answer feedback animations
- [ ] **5.1.4** Create QuizResults component
- [ ] **5.1.5** Implement quiz state management
- [ ] **5.1.6** Connect to backend quiz endpoints

### 5.2 Analytics Dashboard

**Goal:** Visual insights into learning progress

**Graphs:**
1. **Learning Progress** - Concepts mastered over time (line chart)
2. **Subject Breakdown** - Performance by subject (radar chart)
3. **Engagement Heatmap** - Most active learning times (heatmap)
4. **Quiz Performance** - Score trends (bar chart)
5. **Session Duration** - Study time patterns (area chart)
6. **Modality Effectiveness** - What works best (pie chart)

**Tasks:**

- [ ] **5.2.1** Create Analytics page layout
- [ ] **5.2.2** Create ProgressGraph component (Recharts)
- [ ] **5.2.3** Create SubjectRadar component
- [ ] **5.2.4** Create EngagementHeatmap component
- [ ] **5.2.5** Create QuizTrends component
- [ ] **5.2.6** Create SessionDuration component
- [ ] **5.2.7** Create ModalityChart component
- [ ] **5.2.8** Connect to backend analytics endpoints

---

## 🌐 Phase 6: Internationalization (EN/Urdu)

### 6.1 i18n Setup

**Goal:** Full support for English and Urdu with RTL

**Tasks:**

- [ ] **6.1.1** Set up i18n library (react-i18next)
- [ ] **6.1.2** Create translation files (en.json, ur.json)
- [ ] **6.1.3** Implement RTL support for Urdu
- [ ] **6.1.4** Create language switcher component
- [ ] **6.1.5** Persist language preference

---

## 🚀 Phase 7: Deployment

### 7.1 Backend Deployment

**Tasks:**

- [ ] **7.1.1** Containerize backend (Dockerfile)
- [ ] **7.1.2** Set up PostgreSQL (cloud or Docker)
- [ ] **7.1.3** Set up Redis (cloud or Docker)
- [ ] **7.1.4** Configure environment variables
- [ ] **7.1.5** Deploy to cloud (Railway/Render/AWS)

### 7.2 Frontend Deployment

**Tasks:**

- [ ] **7.2.1** Build production bundle
- [ ] **7.2.2** Configure environment variables
- [ ] **7.2.3** Deploy to Vercel/Netlify
- [ ] **7.2.4** Set up custom domain
- [ ] **7.2.5** Configure CDN for 3D models

---

## 🔢 Metrics Calculation Details

### Concept Complexity Score (CCS)

```python
def calculate_ccs(concept: str, context: str) -> float:
    """
    Calculate how complex a concept is to explain.
    Returns 0-100 score.
    """
    score = 50  # Base score
    
    # Factor 1: Abstract vs Concrete (30%)
    abstract_keywords = ["emotion", "feeling", "time", "love", "idea", "thought"]
    concrete_keywords = ["flower", "tree", "car", "ball", "table", "book"]
    
    if any(kw in concept.lower() for kw in abstract_keywords):
        score += 15  # Abstract = harder
    if any(kw in concept.lower() for kw in concrete_keywords):
        score -= 10  # Concrete = easier
    
    # Factor 2: Step count (25%)
    # Use LLM to determine number of steps to explain
    steps = estimate_explanation_steps(concept)
    score += min(steps * 3, 20)  # More steps = higher complexity
    
    # Factor 3: Vocabulary level (20%)
    vocab_score = calculate_vocabulary_complexity(concept)
    score += vocab_score * 0.2
    
    # Factor 4: Spatial/Visual nature (25%)
    visual_keywords = ["shape", "diagram", "structure", "parts", "looks", "see"]
    if any(kw in concept.lower() for kw in visual_keywords):
        score += 15  # Visual concepts benefit from images
    
    return min(max(score, 0), 100)
```

### Student Engagement Score (SES)

```python
def calculate_ses(events: List[EngagementEvent]) -> float:
    """
    Calculate student engagement based on behavior signals.
    Returns 0-100 score.
    """
    score = 50  # Base score
    
    # Response time (ideal: 5-20 seconds)
    avg_response_time = calculate_avg_response_time(events)
    if 5 <= avg_response_time <= 20:
        score += 20  # Good engagement
    elif avg_response_time > 30:
        score -= 20  # Possible confusion
    elif avg_response_time < 3:
        score -= 10  # Too fast, not reading
    
    # Scroll depth (ideal: 80%+)
    avg_scroll_depth = calculate_avg_scroll_depth(events)
    if avg_scroll_depth >= 0.8:
        score += 15
    elif avg_scroll_depth < 0.5:
        score -= 15  # Not reading everything
    
    # Scroll velocity (ideal: moderate)
    avg_scroll_velocity = calculate_avg_scroll_velocity(events)
    if avg_scroll_velocity > 500:  # pixels/second
        score -= 15  # Skimming too fast
    
    # Positive interactions
    positive_count = count_positive_interactions(events)
    score += min(positive_count * 5, 20)
    
    return min(max(score, 0), 100)
```

### Comprehension Confidence Score (CompCS)

```python
def calculate_comp_cs(exchanges: List[Exchange]) -> float:
    """
    Calculate how well student understands based on responses.
    Returns 0-100 score.
    """
    score = 50  # Base score
    
    for exchange in exchanges:
        response = exchange.student_response.lower()
        
        # Positive signals
        if response in ["yes", "okay", "got it", "understood", "yes!", "yeah"]:
            score += 10
        
        # Negative signals
        if response in ["what", "huh", "i don't understand", "confused", "no"]:
            score -= 15
        
        # Correct fill-in responses
        if exchange.expected_response and is_correct(response, exchange.expected_response):
            score += 15
        elif exchange.expected_response:
            score -= 10  # Wrong answer
        
        # Mini-quiz performance
        if exchange.quiz_result:
            if exchange.quiz_result.correct:
                score += 20
            else:
                score -= 10
    
    return min(max(score, 0), 100)
```

### Session Fatigue Index (SFI)

```python
def calculate_sfi(session: Session) -> float:
    """
    Calculate how fatigued the student is.
    Returns 0-100 (higher = more fatigued).
    """
    fatigue = 0
    
    # Session duration (15+ minutes starts fatigue)
    duration_minutes = session.duration_seconds / 60
    if duration_minutes > 15:
        fatigue += min((duration_minutes - 15) * 2, 30)
    
    # Response degradation (shorter responses over time)
    if is_response_length_declining(session.exchanges):
        fatigue += 20
    
    # Error rate increase
    recent_error_rate = calculate_recent_error_rate(session.exchanges[-5:])
    older_error_rate = calculate_recent_error_rate(session.exchanges[:5])
    if recent_error_rate > older_error_rate + 0.2:
        fatigue += 25
    
    # Scroll speed increase (losing attention)
    if is_scroll_speed_increasing(session.events):
        fatigue += 15
    
    return min(max(fatigue, 0), 100)
```

### Modality Selection Algorithm

```python
def select_modality(state: AgentState) -> List[str]:
    """
    Decide which modalities to use for the response.
    Returns list like ["text", "image"] or ["text", "voice"]
    """
    modalities = ["text"]  # Always include text
    
    # High complexity → add image
    if state.concept_complexity_score > 70:
        modalities.append("image")
    
    # Low engagement → add voice
    if state.student_engagement_score < 50:
        modalities.append("voice")
    
    # Low comprehension after multiple attempts → add image
    if (state.comprehension_confidence_score < 40 and 
        state.exchanges_on_current_chunk >= 2):
        if "image" not in modalities:
            modalities.append("image")
    
    # High fatigue → simplify and add voice
    if state.session_fatigue_index > 60:
        modalities.append("voice")
    
    # Student's historical preference
    if state.modality_effectiveness.get("image", 0) > 0.7:
        if "image" not in modalities:
            modalities.append("image")
    if state.modality_effectiveness.get("voice", 0) > 0.7:
        if "voice" not in modalities:
            modalities.append("voice")
    
    return modalities
```

---

## 📅 Suggested Development Order

### Sprint 1: Foundation
1. Backend API setup (FastAPI, database)
2. Auth endpoints
3. React project setup
4. Basic UI components
5. Auth flow (login/signup)

### Sprint 2: Core Chat
1. Chat API endpoints
2. WebSocket setup
3. Chat UI components
4. Basic message flow (text only)

### Sprint 3: Agent Intelligence
1. Agent state management
2. Metric calculators
3. Modality selection
4. Repetitive explanation generator
5. Concept chunking

### Sprint 4: Multimodal
1. Image generation integration
2. TTS integration
3. Image/voice rendering in chat
4. Engagement tracking

### Sprint 5: 3D & Polish
1. 3D avatar integration
2. Concept models
3. Reward animations
4. Accessibility features

### Sprint 6: Quiz & Analytics
1. Quiz system
2. Analytics tracking
3. Analytics dashboard
4. Progress visualization

### Sprint 7: Deployment
1. Backend deployment
2. Frontend deployment
3. Testing
4. Performance optimization

---

## ✅ Success Criteria

1. **Repetitive Teaching**: Agent explains concepts with 3+ repetitions per chunk
2. **Autonomous Modality**: Agent adds images/voice without user clicking buttons
3. **Chunked Learning**: Complex concepts broken into 2-3 sentence chunks
4. **Interactive Dialogue**: Agent asks "Got it?" and waits for response
5. **Mini Quizzes**: Agent tests understanding after 2-3 exchanges
6. **Learning Analytics**: Track scroll, engagement, quiz scores
7. **3D Engagement**: Avatar speaks and animates with explanations
8. **Accessibility**: Works for autistic learners (calm, predictable, clear)

---

*This plan serves as your roadmap. We'll implement it phase by phase, starting wherever you choose.*

# AutiStudy - Project Documentation

## What is AutiStudy?

AutiStudy is an **educational web application** designed specifically for **autistic students in Pakistan** from **Grade 4 to Grade 7**. It provides an AI-powered tutor that helps students learn **Maths, General Science, and Computer** subjects in a simple and friendly way.

---

## Technologies Used

| Technology | Purpose |
|------------|---------|
| **Python** | Main programming language |
| **Streamlit** | Web application framework (creates the website) |
| **OpenAI GPT-4o-mini** | AI model for generating answers |
| **ChromaDB** | Vector database for storing educational content |
| **NanoBanana Pro API** | Image generation for visual learning |
| **HTML/CSS** | Styling and layout of pages |
| **JSON** | Storing user data, chats, and sessions |

---

## How the Application Works

### Step 1: User Opens the App
- User sees the **Landing Page** with information about AutiStudy
- User can click **Login** or **Sign Up**

### Step 2: User Logs In or Signs Up
- New users create an account with name, email, password, and grade
- Existing users log in with email and password
- Passwords are securely hashed (encrypted)

### Step 3: User Reaches Dashboard
- After login, user sees the **Dashboard**
- User clicks on **AI Tutor** to start learning

### Step 4: User Selects Grade and Subject
- User selects their grade (4, 5, 6, or 7)
- User selects subject (Maths, General Science, or Computer)

### Step 5: User Chats with AI Tutor
- User types a question (e.g., "What is the Internet?")
- The system searches the **knowledge base** (ChromaDB) for relevant information
- **GPT-4o-mini** generates a simple, step-by-step answer
- Answer appears on screen

### Step 6: User Can Get Visual Help
- After each answer, user can click **ImageAid** button
- GPT-4o-mini creates a simple prompt for the image
- **NanoBanana Pro** generates a clean, simple icon/image
- Image helps the student understand visually

---

## Folder Structure

```
AutiStudy/
├── app.py                      # Main application file (entry point)
├── requirements.txt            # List of Python packages needed
├── README.md                   # Project information
│
├── views/                      # All the pages of the website
│   ├── landing.py              # Home page
│   ├── login.py                # Login page
│   ├── signup.py               # Sign up page
│   ├── dashboard.py            # User dashboard
│   ├── ai_tutor.py             # Grade and subject selection
│   └── chat.py                 # AI chat interface
│
├── utils/                      # Helper functions
│   ├── auth.py                 # Login/logout/registration
│   ├── llm.py                  # AI model integration (GPT + Image)
│   ├── rag.py                  # Knowledge base search
│   ├── session.py              # User session management
│   ├── styles.py               # Global CSS styles
│   └── chat_db.py              # Chat history storage
│
├── data/                       # Data storage
│   ├── users.json              # Registered users
│   ├── chats.json              # Chat history
│   └── sessions.json           # Active user sessions
│
├── shared_chroma_db/           # Educational content database
│
└── .streamlit/
    └── secrets.toml            # API keys (OpenAI, etc.)
```

---

## File Descriptions

### Main Files

| File | What it Does |
|------|--------------|
| `app.py` | The main file that runs the entire application. It handles navigation between pages and checks if user is logged in. |
| `requirements.txt` | Lists all Python packages the app needs (streamlit, openai, chromadb, etc.) |

### Views Folder (Pages)

| File | What it Does |
|------|--------------|
| `landing.py` | The home page users see first. Has "Get Started" and "Login" buttons. |
| `login.py` | Login form where users enter email and password. |
| `signup.py` | Registration form for new users to create accounts. |
| `dashboard.py` | Main menu after login. Shows options like "AI Tutor". |
| `ai_tutor.py` | Page where user selects their grade (4-7) and subject. |
| `chat.py` | The main chat page where users talk to the AI tutor. Shows previous chats in sidebar. |

### Utils Folder (Helper Functions)

| File | What it Does |
|------|--------------|
| `auth.py` | Handles user registration, login, logout, and password security. |
| `llm.py` | Connects to OpenAI GPT-4o-mini for generating answers. Also handles image generation with NanoBanana Pro. |
| `rag.py` | Searches the ChromaDB knowledge base to find relevant educational content for answers. |
| `session.py` | Keeps users logged in even after page refresh. Stores session in URL and browser. |
| `styles.py` | Contains all the CSS styling (colors, buttons, fonts) for the entire app. |
| `chat_db.py` | Saves and loads chat history so users can see previous conversations. |

### Data Folder

| File | What it Does |
|------|--------------|
| `users.json` | Stores all registered user accounts (name, email, hashed password, grade). |
| `chats.json` | Stores all chat conversations for each user. |
| `sessions.json` | Stores active login sessions so users stay logged in. |

---

## How the AI Tutor Works

### 1. User Asks a Question
```
User: "What is the Internet?"
```

### 2. System Searches Knowledge Base (RAG)
- The question is converted to a vector (numbers)
- ChromaDB searches for similar educational content
- Relevant chunks of information are retrieved

### 3. GPT-4o-mini Generates Answer
- The retrieved content + user question is sent to GPT-4o-mini
- GPT creates a simple, step-by-step explanation
- Answer is formatted for easy reading

### 4. Answer is Displayed
```
AI: "Great question! The Internet is like a huge network 
that connects computers all over the world..."
```

### 5. User Can Request Image (Optional)
- User clicks "ImageAid" button
- GPT-4o-mini creates a simple image prompt
- NanoBanana Pro generates a clean icon/diagram
- Image is displayed below the answer

---

## How Image Generation Works

### Step 1: User Clicks ImageAid
When user clicks the ImageAid button after an answer.

### Step 2: GPT-4o-mini Creates Image Prompt
The AI converts the question into a simple image description:
```
Input: "What is the Internet?"
Output: "Single flat vector ICON of: globe with wifi signal. 
Style: simple app icon, clean shapes, high contrast, minimal detail."
```

### Step 3: NanoBanana Pro Generates Image
- The prompt is sent to NanoBanana Pro API
- A clean, simple icon is generated
- Image is displayed to help student understand visually

---

## How to Run the Application

### Step 1: Install Python
Make sure Python 3.8 or higher is installed.

### Step 2: Install Required Packages
```bash
pip install -r requirements.txt
```

### Step 3: Set Up API Keys
Create `.streamlit/secrets.toml` file:
```toml
OPENAI_API_KEY = "your-openai-key"
```

Also create `seedreem_api_key_image.txt` with your NanoBanana Pro API key.

### Step 4: Run the Application
```bash
streamlit run app.py
```

### Step 5: Open in Browser
Go to `http://localhost:8501`

---

## Key Features

1. **Simple Interface** - Designed for autistic students with clear buttons and colors
2. **AI Tutor** - Answers questions in simple, step-by-step format
3. **Visual Learning** - ImageAid generates simple icons to help understanding
4. **Chat History** - Previous conversations are saved and can be accessed
5. **Session Persistence** - Users stay logged in even after page refresh
6. **Grade-Specific Content** - Content is tailored for Grades 4-7 Pakistani curriculum

---

## Color Theme

The application uses a **blue theme** which is calming and easy on the eyes:
- Primary Blue: `#2563EB`
- Dark Blue: `#1E3A5F`
- Light Blue: `#DBEAFE`
- Purple accents: `#EDE9FE`
- White backgrounds for readability

---

## Summary

AutiStudy is built using:
- **Python + Streamlit** for the web application
- **OpenAI GPT-4o-mini** for intelligent answers
- **ChromaDB** for storing educational content
- **NanoBanana Pro** for generating helpful images
- **JSON files** for storing user data and chats

The application provides a friendly, visual, and step-by-step learning experience specifically designed for autistic students in Pakistan.

---

*Document created for AutiStudy Project*

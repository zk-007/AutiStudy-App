---
title: AutiStudy
emoji: 📚
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# AutiStudy - AI Tutor for Autistic Students

An educational application designed specifically for autistic students in Pakistan (Grades 4-7). Features an AI-powered tutor with support for English and Urdu languages.

## Features

- **AI Tutor**: Chat-based learning assistant powered by GPT-4o-mini
- **Subject Support**: Maths, General Science, Computer (grade-appropriate)
- **RAG System**: Retrieval-Augmented Generation for accurate textbook-based answers
- **ImageAid**: Generate visual explanations using AI
- **VoiceAid**: Text-to-speech for audio learning
- **Bilingual**: Full English and Urdu support
- **Persistent Sessions**: Chat history saved across sessions

## Deployment Guide

### Step 1: Prepare Your Repository

1. **Create a new GitHub repository**
   - Go to [github.com](https://github.com) and sign in
   - Click "New repository"
   - Name it `AutiStudy` (or any name you prefer)
   - Keep it **Public** (required for free Streamlit Cloud)
   - Do NOT initialize with README (we already have one)

2. **Initialize Git in your project folder**
   
   Open terminal/PowerShell in the AutiStudy folder:
   ```bash
   cd "C:\Users\Zohaib\Downloads\AutiStudy"
   git init
   git add .
   git commit -m "Initial commit - AutiStudy app"
   ```

3. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/AutiStudy.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Handle ChromaDB (Important!)

The `shared_chroma_db` folder is too large for GitHub. You have two options:

**Option A: Use Git LFS (Large File Storage)**
```bash
# Install Git LFS
git lfs install

# Track the ChromaDB folder
git lfs track "shared_chroma_db/**"
git add .gitattributes
git commit -m "Add Git LFS tracking"
git push
```

**Option B: Host ChromaDB Separately**
- Upload `shared_chroma_db` to Google Drive or cloud storage
- Download it when the app starts (requires code modification)

### Step 3: Deploy on Streamlit Cloud

1. **Go to Streamlit Cloud**
   - Visit [share.streamlit.io](https://share.streamlit.io)
   - Sign in with your GitHub account

2. **Create New App**
   - Click "New app"
   - Select your repository: `YOUR_USERNAME/AutiStudy`
   - Branch: `main`
   - Main file path: `app.py`
   - Click "Deploy"

3. **Add Secrets (Very Important!)**
   - After deployment starts, click "Advanced settings" or go to app settings
   - Click "Secrets"
   - Add your API keys in TOML format:
   
   ```toml
   OPENAI_API_KEY = "sk-your-actual-openai-key"
   WAVESPEED_API_KEY = "your-actual-wavespeed-key"
   ```
   
   - Click "Save"

4. **Wait for Deployment**
   - Streamlit will install dependencies and start your app
   - This may take 5-10 minutes for the first deployment
   - Your app will be available at: `https://your-app-name.streamlit.app`

### Step 4: Share Your App

Once deployed, you'll get a public URL like:
```
https://autistudy-yourusername.streamlit.app
```

Share this link with anyone to use the app!

## Local Development

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up secrets**
   ```bash
   cp .streamlit/secrets.toml.example .streamlit/secrets.toml
   # Edit secrets.toml and add your API keys
   ```

3. **Run the app**
   ```bash
   streamlit run app.py
   ```

## Project Structure

```
AutiStudy/
├── app.py                 # Main application entry
├── requirements.txt       # Python dependencies
├── .gitignore            # Git ignore rules
├── .streamlit/
│   ├── config.toml       # Streamlit configuration
│   ├── secrets.toml      # API keys (DO NOT COMMIT)
│   └── secrets.toml.example
├── data/
│   ├── users.json        # User accounts
│   ├── sessions.json     # Session data
│   └── chats.json        # Chat history
├── shared_chroma_db/     # Vector database
├── utils/
│   ├── auth.py           # Authentication
│   ├── chat_db.py        # Chat storage
│   ├── language.py       # Translations
│   ├── llm.py            # AI/LLM functions
│   ├── rag.py            # Retrieval logic
│   ├── session.py        # Session management
│   └── styles.py         # CSS styles
└── views/
    ├── landing.py        # Home page
    ├── login.py          # Login page
    ├── signup.py         # Signup page
    ├── dashboard.py      # Dashboard
    ├── ai_tutor.py       # Grade/subject selection
    └── chat.py           # Chat interface
```

## Troubleshooting

**"Module not found" errors**: Make sure all dependencies are in `requirements.txt`

**API errors**: Check that your secrets are correctly configured in Streamlit Cloud

**ChromaDB not loading**: Ensure the database is properly uploaded (see Step 2)

**App crashes on startup**: Check the logs in Streamlit Cloud dashboard

## License

MIT License - Free for educational use

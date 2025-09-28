# INTERBU: AI Interview Coach

An **end-to-end, privacy-conscious interview practice app**. Upload your resume, get a personalized interview script, record your answers, and receive structured AI feedback with strengths, improvements, and actionable guidance.

---

## 🚀 Features
- **Resume-aware questions**
  - Extracts text + links from PDF resumes (`pdfplumber`).
  - Generates **6–8 tailored technical & behavioral questions**.
- **Smooth interview flow**
  - TTS reads questions aloud.
  - In-browser answer recording; Whisper handles transcription.
  - Live camera preview (video not saved).
- **Feedback & analysis**
  - Automatic post-interview feedback with:
    - Overall rating
    - Strengths & areas for improvement
    - Detailed notes
  - Resume link analysis (GitHub, portfolio, etc.).
  - On-demand **STAR-style sample answers** (4–6 sentences).
  - Fallback support if LLM is unavailable.
- **Privacy & cleanup**
  - User data stored **server-side only**, not in frontend dev server.
  - `POST /cleanup-user-data` clears user responses quickly.

---


## 📝 Usage Flow
1. **Upload resume (PDF)** → saved to `uploads/`  
2. **Generate questions** → 6–8 tailored questions saved to `generated/`  
3. **Practice interview**  
   - TTS reads questions aloud  
   - User records responses → `.webm` + transcript in `responses/answers.txt`  
4. **Auto-analysis**  
   - `POST /analyze-interview` → AI feedback (rating, strengths, improvements)  
   - UI displays structured results  
5. **Sample answers (optional)**  
   - Click "Show Suggested Answer" → STAR-style guidance

---
## 🎥 Demo

<p align="center">
  <a href="https://youtu.be/zAWmCEtYeVw" target="_blank">
    <img src="https://img.youtube.com/vi/zAWmCEtYeVw/hqdefault.jpg" alt="Watch Demo" width="700"/>
  </a>
</p>

> 🎬 Click the image above to watch the full demo (1:08).

---


## 🏗 Architecture
**Backend (Flask, port 5008)**  
- Core logic: `openai_interview_system.py`  
- Resume/QA handling: `resume_questions.py`  
- Whisper model: `medium`  
- CORS allows `http://localhost:3000` + `http://localhost:3001`  
- **Endpoints**:  
  - `POST /upload-resume`: save PDF → `uploads/`  
  - `POST /generate-questions`: write `generated/script.txt` + `questions.txt`  
  - `POST /save-answer`: store audio + transcript in `responses/`  
  - `POST /analyze-interview`: structured feedback (OpenAI primary; LangChain/Ollama fallback)  
  - `POST /generate-sample-answer`: resume-aware STAR answer  
  - `POST /cleanup-user-data`: delete user responses  
  - `GET /script`: latest interview script  

**Frontend (React, port 3000)**  
- Web Speech API for TTS  
- Webpack dev server  
- Clean UI for interview flow  

---

## ⚙️ Requirements
- Python **3.10+**  
- Node **18+**  
- **ffmpeg** (required by Whisper)  
- OpenAI API key  
- *(Optional)* Ollama for local fallback (`langchain-ollama`)  

Install ffmpeg (macOS):  
`brew install ffmpeg`  

---

## 🔧 Backend Setup
1. Create venv + install deps:  
   `python -m venv .venv`  
   `source .venv/bin/activate`  
   `pip install -r requirements.txt`  
2. Configure OpenAI:  
   `python setup_openai.py` → prompts for `OPENAI_API_KEY`  
   *(Optional: set `OPENAI_MODEL`, default in `openai_interview_system.py`)*  
3. Run server:  
   `python resume_questions.py` → http://0.0.0.0:5008  

Notes: Whisper `medium` downloads on first run. Outputs stored in `generated/`.  

---

## 💻 Frontend Setup
1. Go to project: `cd web/interview-practice`  
2. Install & start:  
   `npm install`  
   `npm start` → http://localhost:3000  

CORS is preconfigured to allow ports 3000/3001.  

---

## 🔑 Environment Variables
- `OPENAI_API_KEY` (**required**)  
- `OPENAI_MODEL` (optional, default in `openai_interview_system.py`)  
Created via `setup_openai.py` → saved in `.env`.  

---

## 🔒 Privacy
- User data stored **locally only**:  
  - Resumes → `uploads/`  
  - Audio/transcripts → `responses/`  
  - Generated content → `generated/`  
- Remove user data anytime: `POST /cleanup-user-data`  
- Frontend avoids **live transcripts/audio playback** → reduces over-analysis & protects privacy.  

---

## 🛠 Troubleshooting
- **Whisper / ffmpeg errors** → check `ffmpeg` installation + PATH  
- **OpenAI rate limits/outages** → fallback to local LLM (if available)  
- **CORS issues** → confirm backend on `:5008` & frontend on `:3000`  
- **Permissions** → ensure write access to `uploads/`, `responses/`, `generated/`  
- **Slow startup** → Whisper downloads model on first use  


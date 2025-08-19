# INTERBU: AI Interview Coach

An end-to-end, privacy-conscious interview practice app. Upload your resume PDF, get a personalized interview script, speak your answers, and receive structured AI feedback with strengths, improvements, and detailed guidance.

- Backend: Flask API with OpenAI + Whisper + pdfplumber + LangChain.
- Frontend: React app with Web Speech API (TTS), camera preview, and streamlined interview flow.

## Features

- Personalized questions from your resume:
  - Extracts text and links from PDF resumes (`pdfplumber`).
  - Generates 6–8 mixed technical/behavioral questions tailored to your background.
- Interview flow:
  - TTS reads questions aloud.
  - Record answers in-browser; audio saved + transcribed with Whisper.
  - Live camera preview for confidence (video is not recorded).
- Feedback and analysis:
  - Automatic post-interview feedback with overall rating, strengths, improvements, and detailed notes.
  - Analyzes resume links (GitHub, portfolio, etc.) for additional context.
  - Sample recommended answers (STAR-style, 4–6 sentences, concrete, resume-aware) on-demand for any question.
  - Fallbacks for LLM/availability issues.
- Privacy and cleanup:
  - Generated content and user responses stored server-side (outside the frontend dev server) to avoid hot-reload and for easy cleanup.
  - Cleanup endpoint to delete user data in `responses/`.

## Architecture

- Backend: [resume_questions.py](cci:7://file:///Applications/interbuu/resume_questions.py:0:0-0:0) (Flask, port 5008)
  - Core logic in [openai_interview_system.py](cci:7://file:///Applications/interbuu/openai_interview_system.py:0:0-0:0)
  - Whisper model: `medium`
  - CORS: allows `http://localhost:3000` and `http://localhost:3001`
  - Key endpoints:
    - `POST /upload-resume`: PDF upload → `uploads/`
    - `POST /generate-questions`: creates [generated/script.txt](cci:7://file:///Applications/interbuu/generated/script.txt:0:0-0:0) and [generated/questions.txt](cci:7://file:///Applications/interbuu/generated/questions.txt:0:0-0:0)
    - `POST /save-answer`: saves audio + transcript to `responses/`
    - `POST /analyze-interview`: AI feedback (OpenAI primary; LangChain/Ollama fallback)
    - `POST /generate-sample-answer`: sample answer for a specific question
    - `POST /cleanup-user-data`: deletes files in `responses/`
    - `GET /script`: serves latest interview script text
- Frontend: [web/interview-practice/](cci:7://file:///Applications/interbuu/web/interview-practice:0:0-0:0)
  - Webpack dev server, port 3000
  - Uses Web Speech API for TTS

## Directory Layout

- [openai_interview_system.py](cci:7://file:///Applications/interbuu/openai_interview_system.py:0:0-0:0): OpenAI logic (resume parse, question gen, analysis)
- [resume_questions.py](cci:7://file:///Applications/interbuu/resume_questions.py:0:0-0:0): Flask server and endpoints
- `uploads/`: stored resume PDFs
- `responses/`: audio `.webm` files and [answers.txt](cci:7://file:///Applications/interbuu/web/interview-practice/public/answers.txt:0:0-0:0) transcripts
- `generated/`: backend-only interview script, questions, and feedback output
- [web/interview-practice/](cci:7://file:///Applications/interbuu/web/interview-practice:0:0-0:0): React frontend
  - [src/App.js](cci:7://file:///Applications/interbuu/web/interview-practice/src/App.js:0:0-0:0): main UI
  - [src/App.css](cci:7://file:///Applications/interbuu/web/interview-practice/src/App.css:0:0-0:0): styling
  - [webpack.config.js](cci:7://file:///Applications/interbuu/web/interview-practice/webpack.config.js:0:0-0:0): dev server config (port 3000)
  - [babel.config.json](cci:7://file:///Applications/interbuu/web/interview-practice/babel.config.json:0:0-0:0): transpilation config

## Requirements

- Python 3.10+
- Node 18+ (for React dev server)
- ffmpeg (required by Whisper)
- OpenAI API key
- Optional: Ollama (for local fallback via `langchain-ollama`)

Install ffmpeg on macOS:
- brew install ffmpeg

## Backend Setup

1. Create virtualenv and install dependencies:
   - python -m venv .venv
   - source .venv/bin/activate
   - pip install -r requirements.txt

2. Configure OpenAI environment:
   - python setup_openai.py
   - Enter your `OPENAI_API_KEY` when prompted
   - Optionally set `OPENAI_MODEL` (default is configured in [openai_interview_system.py](cci:7://file:///Applications/interbuu/openai_interview_system.py:0:0-0:0), commonly `gpt-4o-mini`)

3. Run the API:
   - python resume_questions.py
   - Server listens on http://0.0.0.0:5008

Notes:
- Whisper model `medium` is loaded at startup: first run may download the model.
- Generated artifacts created in `generated/`.

## Frontend Setup

1. Open [web/interview-practice/](cci:7://file:///Applications/interbuu/web/interview-practice:0:0-0:0)
2. Install and start dev server:
   - npm install
   - npm start
   - Runs on http://localhost:3000

CORS is preconfigured in [resume_questions.py](cci:7://file:///Applications/interbuu/resume_questions.py:0:0-0:0) to allow 3000/3001.

## Usage Flow

1. Upload resume (PDF) from the frontend:
   - Backend saves to `uploads/` and returns path.
2. Generate questions:
   - Uses OpenAI (and resume context) to produce 6–8 questions.
   - Backend writes [generated/script.txt](cci:7://file:///Applications/interbuu/generated/script.txt:0:0-0:0) and [generated/questions.txt](cci:7://file:///Applications/interbuu/generated/questions.txt:0:0-0:0).
3. Practice interview:
   - TTS reads each question.
   - Record your response. The app saves `.webm` and a Whisper transcript entry to `responses/answers.txt`.
4. Auto-analysis:
   - After the last question, the app triggers `POST /analyze-interview`.
   - Backend returns structured feedback; the UI shows rating, strengths, improvements, detailed analysis.
5. Sample answers (optional):
   - Click “Show Suggested Answer” for a question to get a STAR-quality, resume-aware sample.


## Environment Variables

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional; see [openai_interview_system.py](cci:7://file:///Applications/interbuu/openai_interview_system.py:0:0-0:0))

Created by [setup_openai.py](cci:7://file:///Applications/interbuu/setup_openai.py:0:0-0:0) into [.env](cci:7://file:///Applications/interbuu/.env:0:0-0:0).

## Privacy

- User data is stored locally:
  - Resumes in `uploads/`
  - Audio/transcripts in `responses/`
  - Generated artifacts in `generated/`
- Use `POST /cleanup-user-data` to remove items from `responses/`.
- Frontend does not expose audio playback or live transcript to protect privacy and reduce over-analysis during practice.

## Troubleshooting

- Whisper/ffmpeg errors:
  - Ensure `ffmpeg` is installed and on PATH.
- OpenAI rate limits or outages:
  - API returns fallback analysis via local LLM if available.
- CORS errors:
  - Confirm backend at http://localhost:5008 and frontend at http://localhost:3000.
- Permissions:
  - Ensure the app can create `uploads/`, `responses/`, and `generated/`.
- Model downloads are slow:
  - First Whisper run may download `medium` model; allow time.

## Scripts

- Backend: `python resume_questions.py` (port 5008)
- Frontend: `npm start` in [web/interview-practice/](cci:7://file:///Applications/interbuu/web/interview-practice:0:0-0:0) (port 3000)

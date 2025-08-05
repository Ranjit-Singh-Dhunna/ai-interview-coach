import os
import json
import re
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import pdfplumber
from flask import Flask, request, jsonify
import os
import base64
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from datetime import datetime
import json

# Add this at the top of your save_answer function
session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
answers_path = os.path.join("responses", f"answers_{session_id}.txt")

app = Flask(__name__)

# Configure CORS to allow all routes from your React app
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001"],
        "methods": ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
        "allow_headers": ["Content-Type"],
        "supports_credentials": True,
        "max_age": 86400
    }
})

# Configure upload settings
UPLOAD_FOLDER = '/Applications/interbuu/uploads'
ALLOWED_EXTENSIONS = {'pdf'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create upload directory if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

import whisper
from openai_interview_system import OpenAIInterviewSystem, generate_new_questions, analyze_interview_and_links

# Load Whisper model
MODEL = whisper.load_model("medium")

# Define the output schema
class PersonalInfo(BaseModel):
    full_name: str = Field(description="Full name")
    linkedin: Optional[str] = Field(default=None, description="LinkedIn URL")
    github: Optional[str] = Field(default=None, description="GitHub URL")
    portfolio: Optional[str] = Field(default=None, description="Portfolio/Website URL")

class Skills(BaseModel):
    categories: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Skill categories"
    )

class Experience(BaseModel):
    role: str = Field(description="Job title")
    company: str = Field(description="Company name")
    duration: str = Field(description="Employment period")
    achievements: List[str] = Field(default=[], description="Key accomplishments")
    context: Optional[Dict[str, str]] = Field(
        default=None,
        description="Field-specific details"
    )

class Project(BaseModel):
    name: str = Field(..., description="Project name")
    domain: Optional[str] = Field(default=None, description="Field/industry")
    components: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="Relevant components"
    )
    impact: Optional[str] = Field(default=None, description="Measurable outcomes")

class ResumeData(BaseModel):
    personal_info: PersonalInfo
    skills: Skills
    experience: List[Experience]
    projects: Optional[List[Project]] = Field(
        default=[],
        description="Detailed projects"
    )

# Initialize LLM once
llm = OllamaLLM(model="mistral")
parser = JsonOutputParser(pydantic_object=ResumeData)

def extract_text_and_links(pdf_path):
    text = ""
    links = []
    
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() + "\n"
            
            if hasattr(page, 'hyperlinks'):
                for link in page.hyperlinks:
                    if link:
                        links.append(link['uri'])
            
            if '/Annots' in page.objects:
                for annot in page.objects['/Annots']:
                    if annot.get('/A') and annot['/A'].get('/URI'):
                        links.append(annot['/A']['/URI'])
    
    for label in ['LinkedIn', 'GitHub', 'LeetCode', 'Portfolio']:
        if label in text:
            nearby_text = text.split(label)[-1][:100]
            if url_match := re.search(r'https?://[^\s\)]+', nearby_text):
                links.append(url_match.group())
    
    links.extend(re.findall(r'https?://[^\s\)]+', text))
    return text, list(set(links))

# Resume parsing prompt
resume_prompt = PromptTemplate(
    template="""
    Extract structured data from this resume:
    {resume_text}
    Detected Links: {hyperlinks}
    {format_instructions}
    """,
    input_variables=["resume_text", "hyperlinks"],
    partial_variables={"format_instructions": parser.get_format_instructions()}
)

# Interview generation prompt
interview_prompt = PromptTemplate(
    template="""
    Based on this resume data, generate professional interview questions:
    {resume_data}
    
    Create a comprehensive interview with:
    1. Introduction question
    2. 4-6 technical questions based on skills and projects
    3. 3 behavioral questions about teamwork and problem-solving
    4. 1-2 case studies related to the person's experience
    5. Closing question
    
    Format each question exactly like this:
    Interviewer: "[Your question here]"
    Answer: (Provide a brief introduction about yourself and your career path)
    
    Make questions specific to the person's background, skills, and projects.
    """,
    input_variables=["resume_data"]
)

def process_resume(pdf_path):
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    
    text, links = extract_text_and_links(pdf_path)
    resume_chain = resume_prompt | llm | parser
    return resume_chain.invoke({"resume_text": text, "hyperlinks": links})

def generate_interview(resume_data: Dict):
    simple_prompt = PromptTemplate(
        template="""
        Generate a complete interview for this candidate:
        {resume_data}
        
        Start the interview with something like:
        "Hello [read name from data provided below], it's a pleasure to meet you. Let's get started with the interview. Could you please briefly tell me about yourself and your professional background as outlined in your resume?"
        
        Then create 6-8 professional interview questions covering:
        - Technical skills and programming languages
        - Projects 
        - Problem-solving and methodologies
        - Teamwork and communication
        - Career goals and growth
        - Add expresion in follow up questions
        
        End the interview with something like:
        "Thank you for taking the time to share your experiences with us today. To wrap up, do you have any questions for us about the company or this position that I haven't addressed during our conversation?"
        
        Format each question EXACTLY like this:
        Interviewer: "[Your question here]"
        Answer me: (Provide helpful guidance on what to say)
        
        Make sure to include "Answer me:" with helpful hints after each question and it should have no new line.
        """,
        input_variables=["resume_data"]
    )
    simple_chain = simple_prompt | llm
    return simple_chain.invoke({"resume_data": str(resume_data)})

def save_interview_to_file(interview_content, file_path):
    try:
        with open(file_path, 'w') as file:
            file.write(interview_content)
        print(f"Interview questions saved to {file_path}")
    except Exception as e:
        print(f"Error saving interview questions: {e}")

def extract_interviewer_lines(interview_content):
    """Extracts only lines starting with 'Interviewer:'"""
    return '\n'.join(line for line in interview_content.split('\n') 
                    if line.startswith('Interviewer:'))

def save_to_file(content, file_path):
    try:
        with open(file_path, 'w') as file:
            file.write(content)
        print(f"Content saved to {file_path}")
    except Exception as e:
        print(f"Error saving file: {e}")

@app.route('/save-answer', methods=['POST'])
def save_answer():
    print("\n=== Received request to /save-answer ===")
    
    try:
        # Log headers for debugging
        print("Request headers:", request.headers)
        
        # Get JSON data
        data = request.get_json()
        
        if not data:
            print("Error: No data received in request")
            return jsonify({"status": "error", "message": "No data received"}), 400
        
        # Extract fields with fallbacks
        question = data.get('question', 'Unknown Question')
        answer = data.get('answer', '')
        audio_base64 = data.get('audio', '')
        timestamp = data.get('timestamp', datetime.now().isoformat())
        
        print(f"\nProcessing question: {question}")
        print(f"Transcript length: {len(answer)} characters")
        print(f"Audio data length: {len(audio_base64)} base64 characters")
        print(f"Timestamp: {timestamp}")

        # Verify audio data
        if not audio_base64:
            print("Warning: No audio data received")
        
        # Save audio to file and transcribe with Whisper
        transcribed_text = "[No transcript available]"
        try:
            audio_data = base64.b64decode(audio_base64)
            filename = f"response_{timestamp.replace(':', '-').replace('.', '-')}.webm"
            save_path = os.path.join("responses", filename)
            
            print(f"\nSaving audio to: {save_path}")
            os.makedirs("responses", exist_ok=True)
            
            with open(save_path, 'wb') as f:
                f.write(audio_data)
            print(f"Successfully saved audio file ({len(audio_data)} bytes)")
            
            # Transcribe audio using Whisper
            if len(audio_data) > 1000:  # Only transcribe if audio has substantial content
                print("\nTranscribing audio with Whisper...")
                try:
                    result = MODEL.transcribe(save_path)
                    transcribed_text = result["text"].strip()
                    print(f"Whisper transcription successful: '{transcribed_text}'")
                    
                    if not transcribed_text or len(transcribed_text.strip()) < 3:
                        transcribed_text = "[Audio too short or unclear for transcription]"
                        print("Warning: Transcription was too short or empty")
                        
                except Exception as whisper_error:
                    print(f"Whisper transcription failed: {str(whisper_error)}")
                    transcribed_text = f"[Transcription failed: {str(whisper_error)}]"
            else:
                print("Audio file too small for transcription")
                transcribed_text = "[Audio file too small]"
                
        except Exception as audio_error:
            print(f"Error saving audio: {str(audio_error)}")
            return jsonify({
                "status": "error",
                "message": f"Audio save failed: {str(audio_error)}"
            }), 500

        # Save answer to answers.txt
        answers_path = os.path.join("responses", "answers.txt")
        print(f"\nSaving transcript to: {answers_path}")
        
        try:
            os.makedirs(os.path.dirname(answers_path), exist_ok=True)
            
            # Check if file exists to determine if we need headers
            file_exists = os.path.exists(answers_path)
            
            with open(answers_path, 'a', encoding='utf-8') as f:
                if not file_exists:
                    print("Creating new answers.txt file")
                    f.write("# Interview Answers Log\n\n")
                
                entry = f"""---
Timestamp: {timestamp}
Question: {question}
Transcript: {transcribed_text}

"""
                f.write(entry)
                print(f"Successfully wrote transcript entry ({len(entry)} characters)")
                
                # Verify write by reading last line
                if os.path.exists(answers_path):
                    with open(answers_path, 'r', encoding='utf-8') as verify_file:
                        lines = verify_file.readlines()
                        print(f"File verification - last 3 lines: {lines[-3:]}")
                else:
                    print("Warning: Could not verify file after writing")
                    
        except Exception as transcript_error:
            print(f"Error saving transcript: {str(transcript_error)}")
            return jsonify({
                "status": "error",
                "message": f"Transcript save failed: {str(transcript_error)}"
            }), 500

        print("\n=== Successfully processed request ===")
        return jsonify({
            "status": "success", 
            "message": "Audio and transcript saved.",
            "question": question,
            "timestamp": timestamp,
            "transcript_length": len(transcribed_text),
            "transcript": transcribed_text
        })
    
    except Exception as e:
        print(f"\n!!! Critical error in save_answer: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Internal server error: {str(e)}"
        }), 500


@app.route('/generate-questions', methods=['POST'])
def generate_questions_endpoint():
    """Phase 1: Generate new interview questions using OpenAI"""
    print("\n=== Received request to /generate-questions ===")
    
    try:
        data = request.get_json()
        resume_path = data.get('resume_path', '/Applications/interbuu/Dhunna_R_40294791_CV_pdf.pdf')
        
        print(f"Generating questions for resume: {resume_path}")
        
        # Generate questions using OpenAI
        questions, resume_data = generate_new_questions(resume_path)
        
        # Save the generated script
        script_path = "/Applications/interbuu/web/interview-practice/public/script.txt"
        save_to_file(questions, script_path)
        
        # Extract and save just interviewer questions
        interviewer_lines = extract_interviewer_lines(questions)
        questions_path = "/Applications/interbuu/web/interview-practice/public/questions.txt"
        save_to_file(interviewer_lines, questions_path)
        
        print("Successfully generated and saved new questions")
        
        return jsonify({
            "status": "success",
            "message": "New interview questions generated successfully",
            "questions_count": len(interviewer_lines.split('\n')),
            "resume_links": resume_data.get('links', [])
        })
        
    except Exception as e:
        print(f"Error generating questions: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Failed to generate questions: {str(e)}"
        }), 500


@app.route('/upload-resume', methods=['POST'])
def upload_resume():
    try:
        if 'resume' not in request.files:
            return jsonify({"error": "No resume file provided"}), 400
        
        file = request.files['resume']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}_{filename}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            file.save(filepath)
            
            return jsonify({
                "success": True,
                "message": "Resume uploaded successfully!",
                "resume_path": filepath,
                "filename": filename
            })
        else:
            return jsonify({"error": "Invalid file type. Please upload a PDF file."}), 400
            
    except Exception as e:
        print(f"[upload_resume] Error: {str(e)}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route('/analyze-interview', methods=['POST'])
def analyze_interview_endpoint():
    """Phase 3: Analyze interview performance and provide feedback"""
    print("\n=== Received request to /analyze-interview ===")
    
    try:
        data = request.get_json()
        answers_path = data.get('answers_path', '/Applications/interbuu/responses/answers.txt')
        resume_path = data.get('resume_path', '/Applications/interbuu/Dhunna_R_40294791_CV_pdf.pdf')
        
        print(f"Analyzing interview from: {answers_path}")
        
        # First extract resume data
        system = OpenAIInterviewSystem()
        resume_data = system.extract_resume_data_and_links(resume_path)
        
        # Analyze the interview performance
        feedback, feedback_path = analyze_interview_and_links(answers_path, resume_data)
        
        print(f"Analysis complete. Feedback saved to: {feedback_path}")
        
        return jsonify({
            "status": "success",
            "message": "Interview analysis completed",
            "feedback_path": feedback_path,
            "full_feedback": feedback,
            "feedback_preview": feedback[:500] + "..." if len(feedback) > 500 else feedback,
            "links_analyzed": len(resume_data.get('links', []))
        })
        
    except Exception as e:
        print(f"Error analyzing interview: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Failed to analyze interview: {str(e)}"
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5008, debug=True)
    try:
        # Step 1: Parse resume (silently)
        resume = process_resume("Dhunna_R_40294791_CV_pdf.pdf")
        
        # Step 2: Generate interview
        interview = generate_interview(resume)
        
        # Step 3: Save full script
        script_path = "/Applications/interbuu/web/interview-practice/public/script.txt"
        save_to_file(interview, script_path)
        
        # Step 4: Extract and save just interviewer questions
        interviewer_lines = extract_interviewer_lines(interview)
        questions_path = "/Applications/interbuu/web/interview-practice/public/questions.txt"
        save_to_file(interviewer_lines, questions_path)
        
    except Exception as e:
        print(f"Error: {str(e)}")
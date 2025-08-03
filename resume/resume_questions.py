import os
import json
import re
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
import pdfplumber

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
        
        Start the interview with:
        "Hello Ranjit Singh Dhunna, it's a pleasure to meet you. Let's get started with the interview. Could you please briefly tell me about yourself and your professional background as outlined in your resume?"
        
        Then create 6-8 professional interview questions covering:
        - Technical skills and programming languages
        - Projects (Click2Bill, Code Buddy, DRIP GENIUS)
        - Problem-solving and methodologies
        - Teamwork and communication
        - Career goals and growth
        
        End the interview with:
        "Thank you for taking the time to share your experiences with us today. To wrap up, do you have any questions for us about the company or this position that I haven't addressed during our conversation?"
        
        Format each question exactly like this:
        Interviewer: "[Your question here]"
        Answer me: (Provide helpful guidance on what to say)
        
        Make sure to include "Answer me:" with helpful hints after each question.
        """,
        input_variables=["resume_data"]
    )
    simple_chain = simple_prompt | llm
    return simple_chain.invoke({"resume_data": str(resume_data)})

if __name__ == "__main__":
    try:
        # Extract text from resume directly
        text, links = extract_text_and_links("Dhunna_R_40294791_CV_pdf.pdf")
        
        # Create simple resume summary for interview generation
        resume_summary = f"""
        Resume Summary:
        {text}
        
        Detected Links: {', '.join(links)}
        """
        
        # Generate and print only interview questions
        interview = generate_interview({"resume_text": resume_summary})
        print(interview)
        
    except Exception as e:
        print(f"Error: {str(e)}")
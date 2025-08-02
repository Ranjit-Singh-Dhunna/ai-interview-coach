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
    As a professional interviewer, generate questions for:
    {resume_data}
    
    Include:
    1. Introduction
    2. 4-6 technical questions
    3. 3 behavioral questions 
    4. 1-2 case studies
    5. Closing
    
    Format each question with:
    Interviewer: "[question]"
    answer me
    
    Reference specific resume items and vary difficulty.
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
    interview_chain = interview_prompt | llm
    return interview_chain.invoke({"resume_data": json.dumps(resume_data)})

if __name__ == "__main__":
    try:
        # Step 1: Parse resume
        resume = process_resume("Dhunna_R_40294791_CV_pdf.pdf")
        print("Parsed Resume Data:")
        print(json.dumps(resume, indent=2))
        
        # Step 2: Generate interview
        interview = generate_interview(resume)
        print("\nGenerated Interview Questions:")
        print(interview)
        
    except Exception as e:
        print(f"Error: {str(e)}")
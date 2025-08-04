import os
import json
import re
import requests
from typing import List, Dict, Optional
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv
import pdfplumber

# Load environment variables
load_dotenv()

class OpenAIInterviewSystem:
    def __init__(self):
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key or api_key == 'your_openai_api_key_here':
            raise ValueError(
                "OpenAI API key not configured. Please:\n"
                "1. Get your API key from: https://platform.openai.com/api-keys\n"
                "2. Create a .env file in /Applications/interbuu/ with:\n"
                "   OPENAI_API_KEY=your_actual_api_key_here\n"
                "3. Restart the Flask server"
            )
        self.client = OpenAI(api_key=api_key)
        self.model = "gpt-4o-mini"  # Cost-effective model for interview tasks
        
    def extract_resume_data_and_links(self, pdf_path: str) -> Dict:
        """Extract text and links from resume PDF"""
        text = ""
        links = []
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
                    
                    # Extract hyperlinks
                    if hasattr(page, 'hyperlinks'):
                        for link in page.hyperlinks:
                            if link and 'uri' in link:
                                links.append(link['uri'])
                    
                    # Extract annotations (PDF links)
                    if '/Annots' in page.objects:
                        for annot in page.objects['/Annots']:
                            if annot.get('/A') and annot['/A'].get('/URI'):
                                links.append(annot['/A']['/URI'])
        except Exception as e:
            print(f"Error reading PDF: {e}")
            return {"text": "", "links": []}
        
        # Extract URLs from text using regex
        url_pattern = r'https?://[^\s\)]+|www\.[^\s\)]+'
        text_urls = re.findall(url_pattern, text)
        links.extend(text_urls)
        
        # Clean and deduplicate links
        clean_links = []
        for link in links:
            if link and isinstance(link, str):
                # Clean the link
                link = link.strip()
                if not link.startswith('http'):
                    link = 'https://' + link
                clean_links.append(link)
        
        return {
            "text": text,
            "links": list(set(clean_links))  # Remove duplicates
        }
    
    def generate_interview_questions(self, resume_data: Dict) -> str:
        """Phase 1: Generate personalized interview questions using OpenAI"""
        
        resume_text = resume_data.get("text", "")
        resume_links = resume_data.get("links", [])
        
        prompt = f"""
        Based on the following resume, generate a comprehensive interview script with 6-8 personalized questions.
        
        RESUME TEXT:
        {resume_text}
        
        RESUME LINKS:
        {', '.join(resume_links) if resume_links else 'No links found'}
        
        INSTRUCTIONS:
        1. Start with a warm greeting using the candidate's name from the resume
        2. Create 6-8 questions covering:
           - Technical skills and programming languages mentioned
           - Specific projects and their impact
           - Problem-solving approaches
           - Team collaboration
           - Career goals and aspirations
           - Questions about their portfolio/GitHub if links are available
        
        3. Format EXACTLY like this:
        Interviewer: "Question here"
        Answer me: (Helpful guidance for the candidate)
        
        4. Make questions specific to their background, not generic
        5. Reference specific technologies, projects, or achievements from their resume
        6. If GitHub/portfolio links are present, ask about specific projects or code
        
        Generate a professional, personalized interview script now:
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert technical interviewer who creates personalized interview questions based on candidate resumes."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"Error generating questions: {e}")
            return self._get_fallback_questions()
    
    def analyze_links_content(self, links: List[str]) -> Dict:
        """Analyze content from resume links (GitHub, portfolio, etc.)"""
        link_analysis = {}
        
        for link in links:
            try:
                if 'github.com' in link.lower():
                    link_analysis[link] = self._analyze_github_link(link)
                elif any(domain in link.lower() for domain in ['portfolio', 'personal', 'website']):
                    link_analysis[link] = self._analyze_portfolio_link(link)
                else:
                    link_analysis[link] = self._analyze_generic_link(link)
            except Exception as e:
                link_analysis[link] = f"Could not analyze: {str(e)}"
        
        return link_analysis
    
    def _analyze_github_link(self, github_url: str) -> str:
        """Analyze GitHub profile/repository"""
        try:
            # Extract username/repo from GitHub URL
            parts = github_url.replace('https://github.com/', '').split('/')
            if len(parts) >= 1:
                username = parts[0]
                
                # Use GitHub API to get basic info
                api_url = f"https://api.github.com/users/{username}"
                response = requests.get(api_url, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    return f"GitHub Profile Analysis: {data.get('public_repos', 0)} public repositories, {data.get('followers', 0)} followers. Bio: {data.get('bio', 'No bio available')}"
                else:
                    return "GitHub profile found but could not fetch details"
            
        except Exception as e:
            return f"GitHub analysis failed: {str(e)}"
        
        return "GitHub link detected but analysis failed"
    
    def _analyze_portfolio_link(self, portfolio_url: str) -> str:
        """Analyze portfolio website"""
        try:
            response = requests.get(portfolio_url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
            if response.status_code == 200:
                content = response.text[:1000]  # First 1000 chars
                return f"Portfolio website accessible. Content preview: {content[:200]}..."
            else:
                return f"Portfolio website returned status code: {response.status_code}"
        except Exception as e:
            return f"Portfolio analysis failed: {str(e)}"
    
    def _analyze_generic_link(self, url: str) -> str:
        """Analyze generic links"""
        try:
            response = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
            if response.status_code == 200:
                return f"Link accessible (Status: {response.status_code})"
            else:
                return f"Link returned status code: {response.status_code}"
        except Exception as e:
            return f"Link analysis failed: {str(e)}"
    
    def analyze_interview_performance(self, answers_file_path: str, resume_data: Dict) -> str:
        """Phase 3: Analyze interview answers and provide comprehensive feedback"""
        
        # Read the answers file
        try:
            with open(answers_file_path, 'r', encoding='utf-8') as f:
                answers_content = f.read()
        except Exception as e:
            return f"Error reading answers file: {e}"
        
        # Analyze resume links
        links = resume_data.get("links", [])
        link_analysis = self.analyze_links_content(links) if links else {}
        
        # Create comprehensive analysis prompt
        prompt = f"""
        Analyze this interview performance and provide comprehensive feedback.
        
        INTERVIEW ANSWERS:
        {answers_content}
        
        RESUME LINKS ANALYSIS:
        {json.dumps(link_analysis, indent=2) if link_analysis else 'No links to analyze'}
        
        ORIGINAL RESUME:
        {resume_data.get('text', 'No resume text available')}
        
        ANALYSIS REQUIREMENTS:
        
        1. **ANSWER QUALITY ANALYSIS:**
           - Evaluate the depth and relevance of each answer
           - Identify strong points and areas for improvement
           - Rate communication skills and clarity
           - Assess technical knowledge demonstration
        
        2. **CONSISTENCY CHECK:**
           - Compare answers with resume claims
           - Identify any discrepancies or gaps
           - Evaluate if the candidate backed up their resume with examples
        
        3. **LINK/PORTFOLIO ANALYSIS:**
           - Analyze GitHub profile, portfolio, or other professional links
           - Evaluate the quality and relevance of their work
           - Check if their online presence matches their interview performance
           - Provide specific feedback on their projects or code (if accessible)
        
        4. **OVERALL ASSESSMENT:**
           - Strengths and weaknesses summary
           - Interview performance rating (1-10)
           - Specific recommendations for improvement
           - Areas where the candidate excelled
        
        5. **ACTIONABLE FEEDBACK:**
           - Specific suggestions for better answers
           - Recommendations for portfolio/GitHub improvements
           - Interview skills development advice
           - Technical skills to focus on
        
        Provide a detailed, constructive analysis that helps the candidate improve their interview performance and professional presentation.
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert interview coach and technical recruiter who provides detailed, constructive feedback on interview performance."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,  # Lower temperature for more consistent analysis
                max_tokens=3000
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            return f"Error analyzing interview performance: {e}"
    
    def _get_fallback_questions(self) -> str:
        """Fallback questions if OpenAI fails"""
        return """
        Interviewer: "Hello! Thank you for taking the time to interview with us today. Could you please start by telling me about yourself and your professional background?"
        Answer me: (Provide a brief overview of your experience, key skills, and what drives you professionally)
        
        Interviewer: "What programming languages and technologies are you most comfortable working with?"
        Answer me: (Mention your strongest technical skills and provide examples of how you've used them)
        
        Interviewer: "Can you walk me through a challenging project you've worked on recently?"
        Answer me: (Describe the project, your role, challenges faced, and how you overcame them)
        
        Interviewer: "How do you approach problem-solving when faced with a technical challenge?"
        Answer me: (Explain your methodology, tools you use, and how you break down complex problems)
        
        Interviewer: "Tell me about a time you had to work collaboratively with a team."
        Answer me: (Share a specific example highlighting your teamwork and communication skills)
        
        Interviewer: "What are your career goals and how does this position align with them?"
        Answer me: (Connect your aspirations with the role and show your motivation)
        """
    
    def save_feedback_to_file(self, feedback: str, output_path: str = None) -> str:
        """Save the interview feedback to a file"""
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = f"/Applications/interbuu/responses/interview_feedback_{timestamp}.txt"
        
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write("# INTERVIEW PERFORMANCE ANALYSIS\n")
                f.write(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
                f.write(feedback)
            
            return output_path
        except Exception as e:
            print(f"Error saving feedback: {e}")
            return ""

# Main execution functions
def generate_new_questions(resume_pdf_path: str) -> str:
    """Phase 1: Generate new interview questions"""
    system = OpenAIInterviewSystem()
    
    print("📄 Extracting resume data and links...")
    resume_data = system.extract_resume_data_and_links(resume_pdf_path)
    
    print("🤖 Generating personalized interview questions with OpenAI...")
    questions = system.generate_interview_questions(resume_data)
    
    return questions, resume_data

def analyze_interview_and_links(answers_file_path: str, resume_data: Dict) -> str:
    """Phase 3: Analyze interview performance and links"""
    system = OpenAIInterviewSystem()
    
    print("🔍 Analyzing interview performance and resume links...")
    feedback = system.analyze_interview_performance(answers_file_path, resume_data)
    
    print("💾 Saving feedback to file...")
    feedback_path = system.save_feedback_to_file(feedback)
    
    return feedback, feedback_path

if __name__ == "__main__":
    # Example usage
    resume_path = "/Applications/interbuu/Dhunna_R_40294791_CV_pdf.pdf"
    answers_path = "/Applications/interbuu/responses/answers.txt"
    
    # Phase 1: Generate questions
    questions, resume_data = generate_new_questions(resume_path)
    print("Generated Questions:")
    print(questions)
    
    # Phase 3: Analyze performance (after interview is completed)
    if os.path.exists(answers_path):
        feedback, feedback_path = analyze_interview_and_links(answers_path, resume_data)
        print(f"\nFeedback saved to: {feedback_path}")

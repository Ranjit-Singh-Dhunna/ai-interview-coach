#!/usr/bin/env python3
"""
OpenAI API Key Setup Script
This script helps you configure your OpenAI API key for the interview system.
"""

import os
import sys

def setup_openai_key():
    print("🤖 OpenAI Interview System Setup")
    print("=" * 40)
    
    # Check if .env file exists
    env_path = "/Applications/interbuu/.env"
    
    print("📋 Instructions:")
    print("1. Go to: https://platform.openai.com/api-keys")
    print("2. Create a new API key")
    print("3. Copy the API key")
    print()
    
    api_key = input("🔑 Paste your OpenAI API key here: ").strip()
    
    if not api_key:
        print("❌ No API key provided. Exiting.")
        return False
    
    if api_key == 'your_openai_api_key_here':
        print("❌ Please use your actual API key, not the placeholder.")
        return False
    
    # Create .env file
    try:
        with open(env_path, 'w') as f:
            f.write(f"# OpenAI API Configuration\n")
            f.write(f"OPENAI_API_KEY={api_key}\n")
        
        print(f"✅ API key saved to {env_path}")
        print("🔄 Please restart your Flask server to apply changes:")
        print("   1. Stop the current server (Ctrl+C)")
        print("   2. Run: source venv/bin/activate")
        print("   3. Run: python3 resume_questions.py")
        return True
        
    except Exception as e:
        print(f"❌ Error saving API key: {e}")
        return False

def test_openai_connection():
    """Test if OpenAI is properly configured"""
    try:
        from openai_interview_system import OpenAIInterviewSystem
        system = OpenAIInterviewSystem()
        print("✅ OpenAI connection test successful!")
        return True
    except Exception as e:
        print(f"❌ OpenAI connection test failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_openai_connection()
    else:
        setup_openai_key()

import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [script, setScript] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voice, setVoice] = useState(null);
  const [volume, setVolume] = useState(1.2);
  const [userTranscript, setUserTranscript] = useState('');
  const [audioURL, setAudioURL] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const shouldStartRecordingRef = useRef(false);

  // Initialize speech synthesis and recognition
  useEffect(() => {
    const initSpeech = () => {
      const synth = window.speechSynthesis;
      synthRef.current = synth;
      const voices = synth.getVoices();
      
      if (voices.length > 0) {
        const preferredVoice = voices.find(v => 
          v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('David'))
        ) || 
        voices.find(v => 
          v.lang.includes('en') && v.voiceURI.includes('Google')
        ) || 
        voices.find(v => v.lang.includes('en'));
        
        setVoice(preferredVoice || voices[0]);
      }
    };

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        setUserTranscript(transcript);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        stopRecording();
      };
    }

    const loadScript = async () => {
      try {
        const response = await fetch('/script.txt');
        if (!response.ok) throw new Error('Failed to load script');
        const text = await response.text();
        parseScript(text);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadScript();
    
    const synth = window.speechSynthesis;
    synthRef.current = synth;
    synth.onvoiceschanged = initSpeech;
    initSpeech();

    return () => {
      if (synth) {
        synth.cancel();
      }
      stopRecording();
    };
  }, []);

  // Handle recording start/stop based on speech state
  useEffect(() => {
    if (shouldStartRecordingRef.current && !isSpeaking && currentIndex >= 0 && !isRecording) {
      startRecording();
      shouldStartRecordingRef.current = false;
    }
  }, [isSpeaking, currentIndex, isRecording]);

  const parseScript = (text) => {
    const lines = text.split('\n');
    const parsedScript = [];
    let currentQuestion = null;

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      if (trimmedLine.startsWith('Interviewer:')) {
        if (currentQuestion) parsedScript.push(currentQuestion);
        currentQuestion = {
          question: trimmedLine.replace('Interviewer:', '').trim(),
          answer: ''
        };
      } else if (trimmedLine.startsWith('Answer me:')) {
        if (currentQuestion) {
          currentQuestion.answer = trimmedLine.replace('Answer me:', '').trim();
        }
      } else if (currentQuestion) {
        currentQuestion.answer += (currentQuestion.answer ? '\n' : '') + trimmedLine;
      }
    });

    if (currentQuestion) parsedScript.push(currentQuestion);
    setScript(parsedScript);
  };

  const speakQuestion = (text) => {
    if (!synthRef.current || !voice) return;
    
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    
    if (voice.name.includes('Natural') || voice.name.includes('Zira')) {
      utterance.rate = 0.9;
      utterance.pitch = 0.95;
    } else if (voice.voiceURI.includes('Google')) {
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
    } else {
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
    }
    
    utterance.volume = Math.min(volume, 1.5);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      shouldStartRecordingRef.current = true;
    };
    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      setIsSpeaking(false);
    };
    
    synthRef.current.speak(utterance);
    utteranceRef.current = utterance;
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const startRecording = async () => {
    try {
      setSaveError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        
        try {
          await saveResponse(audioBlob);
        } catch (error) {
          console.error('Error saving response:', error);
          setSaveError('Failed to save response. Please try again.');
        } finally {
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      setSaveError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      setIsSaving(true);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  };

  const saveResponse = async (audioBlob) => {
    console.log("[saveResponse] Starting to save response...");
    
    return new Promise((resolve, reject) => {
      console.log("[saveResponse] Creating FileReader...");
      const audioReader = new FileReader();
      
      audioReader.onloadend = async () => {
        try {
          const currentQuestion = script[currentIndex].question;
          console.log("[saveResponse] Processing question:", currentQuestion);
          
          const audioBase64 = audioReader.result.split(',')[1];
          console.log("[saveResponse] Audio data length:", audioBase64.length, "base64 chars");
          console.log("[saveResponse] User transcript:", userTranscript);
          
          console.log("[saveResponse] Preparing request payload...");
          const payload = {
            question: currentQuestion,
            answer: userTranscript,
            audio: audioBase64,
            timestamp: new Date().toISOString()
          };
          
          console.log("[saveResponse] Sending to backend...");
          const response = await fetch('http://localhost:5008/save-answer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
  
          if (!response.ok) {
            const errorText = await response.text();
            console.error("[saveResponse] Server error:", response.status, errorText);
            throw new Error(`Server error: ${response.status} - ${errorText}`);
          }
          
          const result = await response.json();
          console.log("[saveResponse] Save successful:", result);
          
          setUserTranscript('');
          console.log("[saveResponse] Cleared user transcript");
          
          // Automatically advance to next question after successful save
          setTimeout(() => {
            if (currentIndex < script.length - 1) {
              const nextIndex = currentIndex + 1;
              setCurrentIndex(nextIndex);
              setShowAnswer(false);
              console.log("[saveResponse] Auto-advanced to next question:", nextIndex);
              // Auto-speak the next question
              setTimeout(() => {
                speakQuestion(script[nextIndex].question);
              }, 200);
            } else {
              console.log("[saveResponse] Interview completed - all questions answered");
              setCurrentIndex(script.length); // Set beyond script length to show restart button
              
              // Automatically start feedback analysis
              setTimeout(() => {
                analyzeInterview();
              }, 1000); // Small delay to ensure UI updates
            }
          }, 500); // Small delay to show completion feedback
          
          resolve(result);
        } catch (error) {
          console.error("[saveResponse] Error saving response:", error);
          setSaveError(`Failed to save response: ${error.message}`);
          reject(error);
        } finally {
          setIsSaving(false);
          console.log("[saveResponse] Finished save operation");
        }
      };
      
      audioReader.onerror = (error) => {
        console.error("[saveResponse] FileReader error:", error);
        reject(new Error("Failed to read audio data"));
      };
      
      console.log("[saveResponse] Reading audio blob...");
      audioReader.readAsDataURL(audioBlob);
    });
  };

  
  const startInterview = () => {
    console.log("Starting interview...");
    
    if (currentIndex === -1 && script.length > 0) {
      setCurrentIndex(0);
      setShowAnswer(false);
      speakQuestion(script[0].question);
      console.log("Started interview with first question");
    }
  };

  const handleProceed = () => {
    startInterview();
  };
  

  const handleRecommend = () => {
    setShowAnswer(!showAnswer);
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const handleResumeUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      setSaveError('Please upload a PDF file only.');
      return;
    }
    
    setIsUploadingResume(true);
    setSaveError(null);
    
    try {
      const formData = new FormData();
      formData.append('resume', file);
      
      const response = await fetch('http://localhost:5008/upload-resume', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Resume uploaded successfully:', result);
      
      setResumeFile(file);
      setResumeUploaded(true);
      
      // Automatically generate questions after upload
      await generateNewQuestions(result.resume_path);
      
    } catch (error) {
      console.error('Error uploading resume:', error);
      setSaveError(`Failed to upload resume: ${error.message}`);
    } finally {
      setIsUploadingResume(false);
    }
  };

  const generateNewQuestions = async (resumePath = null) => {
    setIsGeneratingQuestions(true);
    setSaveError(null);
    
    try {
      console.log('Generating new questions with OpenAI...');
      
      const response = await fetch('http://localhost:5008/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resume_path: resumePath }),
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Questions generated successfully:', result);
      
      // Reload the script to get new questions
      await loadScript();
      
      // Reset interview state
      setCurrentIndex(-1);
      setShowAnswer(false);
      setAnalysisResult(null);
      
    } catch (error) {
      console.error('Error generating questions:', error);
      setSaveError(`Failed to generate new questions: ${error.message}`);
    } finally {
      setIsGeneratingQuestions(false);
    }
  };
  
  const analyzeInterview = async () => {
    setIsAnalyzing(true);
    setSaveError(null);
    
    try {
      console.log('Analyzing interview performance with OpenAI...');
      
      const response = await fetch('http://localhost:5008/analyze-interview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resume_path: resumeFile ? `/Applications/interbuu/uploads/${resumeFile.name}` : null
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Analysis completed:', result);
      
      setAnalysisResult({
        feedback: result.full_feedback || result.feedback_preview,
        feedbackPath: result.feedback_path,
        linksAnalyzed: result.links_analyzed,
        rating: result.rating || 'N/A',
        strengths: result.strengths || [],
        improvements: result.improvements || []
      });
      
    } catch (error) {
      console.error('Error analyzing interview:', error);
      setSaveError(`Failed to analyze interview: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };



  if (loading) {
    return <div className="status loading">Loading interview script...</div>;
  }

  if (error) {
    return <div className="status error">Error: {error}</div>;
  }

  return (
    <div className="interview-container">
      <h1>Interview Practice</h1>
      
      {saveError && (
        <div className="error-message">
          {saveError}
          <button onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}
      
      {currentIndex >= 0 && currentIndex < script.length ? (
        <>
          <div className="interviewer">
            <strong>Interviewer:</strong> {script[currentIndex].question}
            <button 
              className="speak-button"
              onClick={() => isSpeaking ? stopSpeaking() : speakQuestion(script[currentIndex].question)}
              disabled={!voice}
            >
              {isSpeaking ? '⏹ Stop' : '▶ Speak'}
            </button>
          </div>
          {showAnswer && (
            <div className="answer">
              <strong>Suggested Answer:</strong> {script[currentIndex].answer}
            </div>
          )}

          {isRecording && (
            <div className="recording-section">
              <div className="recording-indicator">
                <div className="pulse"></div>
                <span>Recording your response...</span>
              </div>
              <button 
                className="stop-recording-button"
                onClick={stopRecording}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Stop Recording'}
              </button>
              {userTranscript && (
                <div className="transcript-preview">
                  <strong>Live Transcript:</strong>
                  <p>{userTranscript}</p>
                </div>
              )}
            </div>
          )}

          {audioURL && !isRecording && (
            <div className="audio-playback">
              <audio controls src={audioURL} />
            </div>
          )}
        </>
      ) : currentIndex >= script.length ? (
        <div className="completion-message">
          <p>🎉 Interview completed successfully!</p>
          <p>All {script.length} questions have been answered and saved.</p>
          <p>Check your responses in the answers.txt file.</p>
          
          <div className="analysis-section">
            <button 
              className="analyze-btn"
              onClick={analyzeInterview}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? '🔍 Analyzing...' : '🔍 Get AI Feedback & Analysis'}
            </button>
            
            {analysisResult && (
              <div className="analysis-result">
                <h3>📊 Interview Analysis Complete!</h3>
                
                {analysisResult.rating && (
                  <div className="rating-section">
                    <h4>🎆 Overall Rating: {analysisResult.rating}</h4>
                  </div>
                )}
                
                {analysisResult.strengths && analysisResult.strengths.length > 0 && (
                  <div className="strengths-section">
                    <h4>✅ Strengths:</h4>
                    <ul>
                      {analysisResult.strengths.map((strength, index) => (
                        <li key={index}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {analysisResult.improvements && analysisResult.improvements.length > 0 && (
                  <div className="improvements-section">
                    <h4>📝 Areas for Improvement:</h4>
                    <ul>
                      {analysisResult.improvements.map((improvement, index) => (
                        <li key={index}>{improvement}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="feedback-details">
                  <p><strong>🔗 Links Analyzed:</strong> {analysisResult.linksAnalyzed}</p>
                  <p><strong>📁 Feedback File:</strong> {analysisResult.feedbackPath}</p>
                </div>
                
                <div className="feedback-content">
                  <div className="feedback-header">
                    <h4>📝 Detailed Feedback:</h4>
                    <div className="feedback-actions">
                      <button 
                        className="expand-feedback-btn"
                        onClick={() => setIsExpanded(!isExpanded)}
                      >
                        {isExpanded ? '📄 Collapse' : '📋 Expand Full'}
                      </button>
                      <button 
                        className="copy-feedback-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(analysisResult.feedback);
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                        }}
                      >
                        {copySuccess ? '✅ Copied!' : '📋 Copy Text'}
                      </button>
                    </div>
                  </div>
                  <div className={`feedback-text ${isExpanded ? 'expanded' : ''}`}>
                    <div className="feedback-full-content">
                      {analysisResult.feedback.split('\n\n').map((paragraph, index) => {
                        if (paragraph.trim()) {
                          // Check if it's a heading (starts with #)
                          if (paragraph.trim().startsWith('#')) {
                            const level = paragraph.match(/^#+/)[0].length;
                            const text = paragraph.replace(/^#+\s*/, '');
                            const HeadingTag = `h${Math.min(level + 2, 6)}`;
                            return React.createElement(HeadingTag, { key: index, className: 'feedback-heading' }, text);
                          }
                          // Check if it's a list item
                          else if (paragraph.trim().startsWith('- ') || paragraph.trim().startsWith('* ')) {
                            const items = paragraph.split('\n').filter(item => item.trim());
                            return (
                              <ul key={index} className="feedback-list">
                                {items.map((item, itemIndex) => (
                                  <li key={itemIndex}>{item.replace(/^[-*]\s*/, '')}</li>
                                ))}
                              </ul>
                            );
                          }
                          // Check if it's a numbered list
                          else if (/^\d+\./.test(paragraph.trim())) {
                            const items = paragraph.split('\n').filter(item => item.trim());
                            return (
                              <ol key={index} className="feedback-list">
                                {items.map((item, itemIndex) => (
                                  <li key={itemIndex}>{item.replace(/^\d+\.\s*/, '')}</li>
                                ))}
                              </ol>
                            );
                          }
                          // Regular paragraph
                          else {
                            return <p key={index} className="feedback-paragraph">{paragraph}</p>;
                          }
                        }
                        return null;
                      })}
                    </div>
                  </div>
                  {!isExpanded && (
                    <div className="feedback-gradient-overlay">
                      <button 
                        className="show-more-btn"
                        onClick={() => setIsExpanded(true)}
                      >
                        📖 Show Full Feedback
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="welcome-screen">
          <h1>🎯 AI Interview Practice Coach</h1>
          <p>Practice your interview skills with AI-powered personalized questions!</p>
          
          {!resumeUploaded ? (
            <div className="upload-section">
              <h2>📄 Upload Your Resume</h2>
              <p>Upload your resume PDF to generate personalized interview questions</p>
              
              <div className="upload-container">
                <input
                  type="file"
                  id="resume-upload"
                  accept=".pdf"
                  onChange={handleResumeUpload}
                  disabled={isUploadingResume}
                  style={{ display: 'none' }}
                />
                <label 
                  htmlFor="resume-upload" 
                  className={`upload-btn ${isUploadingResume ? 'uploading' : ''}`}
                >
                  {isUploadingResume ? (
                    <>
                      <div className="loading-spinner"></div>
                      Uploading & Generating Questions...
                    </>
                  ) : (
                    <>
                      📤 Choose Resume PDF
                    </>
                  )}
                </label>
              </div>
              
              <div className="or-divider">
                <span>OR</span>
              </div>
              
              <button className="start-btn" onClick={startInterview}>
                🎤 Start with Default Questions
              </button>
            </div>
          ) : (
            <div className="welcome-buttons">
              <div className="resume-uploaded">
                ✅ Resume uploaded: {resumeFile?.name}
              </div>
              
              <button 
                className="generate-questions-btn"
                onClick={() => generateNewQuestions()}
                disabled={isGeneratingQuestions}
              >
                {isGeneratingQuestions ? (
                  <>
                    <div className="loading-spinner"></div>
                    Generating Questions...
                  </>
                ) : (
                  <>
                    🔄 Regenerate Questions
                  </>
                )}
              </button>
              
              <button className="start-btn" onClick={startInterview}>
                🎤 Start Interview
              </button>
            </div>
          )}
        </div>
      )}
      
      <div className="voice-controls">
        <label htmlFor="volume">Voice Volume:</label>
        <input
          type="range"
          id="volume"
          min="0.5"
          max="1.5"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
        />
        <span>{volume.toFixed(1)}</span>
      </div>

      <div className="buttons">
        {currentIndex === -1 && (
          <button 
            id="start" 
            onClick={handleProceed}
            disabled={script.length === 0}
          >
            Start Interview
          </button>
        )}
        {currentIndex >= script.length && !isRecording && !isSaving && (
          <button 
            id="restart" 
            onClick={() => {
              setCurrentIndex(-1);
              setShowAnswer(false);
              stopSpeaking();
            }}
          >
            Restart Interview
          </button>
        )}
        {currentIndex >= 0 && currentIndex < script.length && (
          <button 
            id="recommend" 
            onClick={handleRecommend}
            disabled={isRecording || isSaving}
          >
            {showAnswer ? 'Hide Suggested Answer' : 'Show Suggested Answer'}
          </button>
        )}
      </div>

      {script.length > 0 && (
        <div className="progress">
          <div>
            {currentIndex >= script.length 
              ? `Interview Completed - ${script.length} questions answered`
              : `Question ${currentIndex + 1} of ${script.length}`
            }
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${currentIndex >= script.length 
                  ? 100
                  : currentIndex >= 0 
                    ? ((currentIndex + 1) / script.length) * 100 
                    : 0}%` 
              }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
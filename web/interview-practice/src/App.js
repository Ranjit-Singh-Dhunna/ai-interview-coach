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
  const [sampleAnswer, setSampleAnswer] = useState('');
  const [isLoadingSampleAnswer, setIsLoadingSampleAnswer] = useState(false);
  const [sampleAnswerCache, setSampleAnswerCache] = useState({});
  const [jobDescription, setJobDescription] = useState('');
  const [resumePath, setResumePath] = useState(null);
  const [startClicked, setStartClicked] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [videoError, setVideoError] = useState(null);
  
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const shouldStartRecordingRef = useRef(false);
  const videoRef = useRef(null);

  // Load the interview script from backend; fallback to public file if needed
  const loadScript = async () => {
    try {
      const ts = Date.now();
      // Try backend endpoint first
      let response = await fetch(`http://localhost:5008/script?ts=${ts}`, { cache: 'no-store' });
      if (!response.ok) {
        // Fallback to public file (dev only)
        response = await fetch(`/script.txt?ts=${ts}`, { cache: 'no-store' });
      }
      if (!response.ok) throw new Error('Failed to load script');
      const text = await response.text();
      parseScript(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Retry loader to refresh questions after regeneration without triggering reloads
  const loadScriptWithRetry = async (maxAttempts = 5, delayMs = 400) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const cacheBuster = Date.now();
        let resp = await fetch(`http://localhost:5008/script?ts=${cacheBuster}`, { cache: 'no-store' });
        if (!resp.ok) {
          // Fallback to public file during dev
          resp = await fetch(`/script.txt?ts=${cacheBuster}`, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
        const text = await resp.text();
        if (text && text.trim().length > 0) {
          parseScript(text);
          return true;
        }
      } catch (e) {
        // wait and retry
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        } else {
          console.error('Failed to refresh script after generation:', e);
          setSaveError('Questions generated, but failed to load the updated script. Please try again.');
          return false;
        }
      }
    }
    return false;
  };

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
      stopVideo();
    };
  }, []);

  // Handle recording start/stop based on speech state
  useEffect(() => {
    if (shouldStartRecordingRef.current && !isSpeaking && currentIndex >= 0 && !isRecording) {
      startRecording();
      shouldStartRecordingRef.current = false;
    }
  }, [isSpeaking, currentIndex, isRecording]);

  // Start/stop camera preview based on interview state
  useEffect(() => {
    const isInterviewActive = currentIndex >= 0 && currentIndex < script.length;
    if (isInterviewActive && !videoEnabled) {
      startVideo();
    }
    if (!isInterviewActive && videoEnabled) {
      stopVideo();
    }
  }, [currentIndex, script.length, videoEnabled]);

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
      // Ensure any previous playback URL is cleared to prevent listening back
      setAudioURL('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Do not create or expose a playback URL; the user should not listen back
        // const audioUrl = URL.createObjectURL(audioBlob);
        // setAudioURL(audioUrl);
        
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

  // Camera preview controls (no recording)
  const startVideo = async () => {
    try {
      setVideoError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setVideoEnabled(true);
    } catch (e) {
      console.error('Error starting camera preview:', e);
      setVideoError('Could not access camera. Please check permissions.');
    }
  };

  const stopVideo = () => {
    try {
      const el = videoRef.current;
      const stream = el && el.srcObject;
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach(t => t.stop());
      }
      if (el) el.srcObject = null;
    } catch (_) {}
    setVideoEnabled(false);
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
          
          const isFinal = currentIndex >= (script.length - 1);
          if (!isFinal) {
            // Fire-and-forget for non-final questions
            console.log("[saveResponse] Sending to backend (fire-and-forget)...");
            fetch('http://localhost:5008/save-answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            .then(async (resp) => {
              if (!resp.ok) {
                const errorText = await resp.text();
                console.warn("[saveResponse] Server error:", resp.status, errorText);
              } else {
                const result = await resp.json();
                console.log("[saveResponse] Save successful:", result);
              }
            })
            .catch(err => console.warn('[saveResponse] Network/save failed:', err));
            
            // Clear transcript and advance immediately without waiting for backend
            setUserTranscript('');
            console.log("[saveResponse] Cleared user transcript");
            
            setTimeout(() => {
              const nextIndex = currentIndex + 1;
              setCurrentIndex(nextIndex);
              setShowAnswer(false);
              console.log("[saveResponse] Auto-advanced to next question:", nextIndex);
              setTimeout(() => speakQuestion(script[nextIndex].question), 200);
            }, 300);
            
            resolve({ ok: true });
          } else {
            // FINAL question: await save before triggering analysis
            console.log("[saveResponse] Final question: awaiting save before analysis...");
            const resp = await fetch('http://localhost:5008/save-answer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!resp.ok) {
              const errorText = await resp.text();
              console.error("[saveResponse] Final save failed:", resp.status, errorText);
              throw new Error(`Server error: ${resp.status} - ${errorText}`);
            }
            const result = await resp.json();
            console.log("[saveResponse] Final save successful:", result);
            
            setUserTranscript('');
            console.log("[saveResponse] Cleared user transcript");
            
            // Mark interview complete and then analyze
            setCurrentIndex(script.length);
            console.log("[saveResponse] Interview completed - all questions answered");
            setTimeout(() => analyzeInterview(), 1000);
            resolve({ ok: true, final: true });
          }
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

  
  const startInterview = async () => {
    console.log("Starting interview...");
    // Always (re)generate questions on start as requested
    await generateNewQuestions(resumePath);
    // After questions refresh, start at Q1
    if (currentIndex === -1 && script.length > 0) {
      setCurrentIndex(0);
      setShowAnswer(false);
      speakQuestion(script[0].question);
      console.log("Started interview with first question");
    } else {
      // In case script reload is slightly delayed, try a short retry
      setTimeout(() => {
        if (script.length > 0 && currentIndex === -1) {
          setCurrentIndex(0);
          setShowAnswer(false);
          speakQuestion(script[0].question);
        }
      }, 600);
    }
  };

  const handleProceed = () => {
    if (startClicked) return;
    setStartClicked(true);
    startInterview();
  };
  

  const handleRecommend = async () => {
    if (!showAnswer) {
      const currentQuestion = script[currentIndex].question;
      const cacheKey = `${currentIndex}-${currentQuestion.substring(0, 50)}`;
      
      // Check if we have cached answer
      if (sampleAnswerCache[cacheKey]) {
        setSampleAnswer(sampleAnswerCache[cacheKey]);
        setShowAnswer(true);
        return;
      }
      
      // If no resume uploaded, generate a hypothetical, educational example (clearly not from resume)
      if (!resumeFile && !resumePath) {
        setShowAnswer(true);
        setIsLoadingSampleAnswer(true);
        try {
          const response = await fetch('http://localhost:5008/generate-sample-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: currentQuestion,
              allow_hypothetical: true,
              forbid_specific_personal_claims: true,
              no_company_names: true,
              no_quantified_personal_results: true,
              include_disclaimer: true,
              job_description: jobDescription && jobDescription.trim() ? jobDescription.trim() : null
            })
          });
          if (response.ok) {
            const result = await response.json();
            const hypo = result.sample_answer?.trim();
            setSampleAnswer(hypo || 'Example approach: Describe the methodology, tools, and reasoning you would use.');
          } else {
            setSampleAnswer('Example approach: Describe the methodology, tools, and reasoning you would use.');
          }
        } catch (_) {
          setSampleAnswer('Example approach: Describe the methodology, tools, and reasoning you would use.');
        } finally {
          setIsLoadingSampleAnswer(false);
        }
        return;
      }
      
      // When resume exists, generate a personalized answer only (no generic fallback shown)
      setSampleAnswer('');
      setShowAnswer(true);

      // Then fetch enhanced answer in background (looser: resume/job as optional context)
      setIsLoadingSampleAnswer(true);
      try {
        const response = await fetch('http://localhost:5008/generate-sample-answer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: currentQuestion,
            // Provide context but allow the model to answer freely
            resume_path: resumePath || (resumeFile ? `/Applications/interbuu/uploads/${resumeFile.name}` : null),
            job_description: jobDescription && jobDescription.trim() ? jobDescription.trim() : null,
            use_resume_as_context: true,
            allow_hypothetical: true
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          const enhancedAnswer = result.sample_answer?.trim();
          if (enhancedAnswer) {
            setSampleAnswer(enhancedAnswer);
            setSampleAnswerCache(prev => ({ ...prev, [cacheKey]: enhancedAnswer }));
          } else {
            // Fallback: hypothetical educational example
            try {
              const hypoResp = await fetch('http://localhost:5008/generate-sample-answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  question: currentQuestion,
                  allow_hypothetical: true,
                  forbid_specific_personal_claims: true,
                  no_company_names: true,
                  no_quantified_personal_results: true,
                  include_disclaimer: true,
                  job_description: jobDescription && jobDescription.trim() ? jobDescription.trim() : null
                })
              });
              if (hypoResp.ok) {
                const hypoJson = await hypoResp.json();
                const hypo = hypoJson.sample_answer?.trim();
                setSampleAnswer(hypo || 'Example approach: Describe the methodology, tools, and reasoning you would use.');
              } else {
                setSampleAnswer('Example approach: Describe the methodology, tools, and reasoning you would use.');
              }
            } catch (e) {
              setSampleAnswer('Example approach: Describe the methodology, tools, and reasoning you would use.');
            }
          }
        } else {
          setSampleAnswer('No personalized answer available from your resume for this question.');
        }
      } catch (err) {
        console.error('Error generating sample answer:', err);
        // Final fallback: generic educational example
        setSampleAnswer('Example approach: Describe the methodology, tools, and reasoning you would use.');
      } finally {
        setIsLoadingSampleAnswer(false);
      }
    } else {
      setShowAnswer(false);
    }
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
      setResumePath(result.resume_path);
      
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
      
      const payload = { resume_path: resumePath };
      if (jobDescription && jobDescription.trim()) {
        payload.job_description = jobDescription.trim();
      }

      const response = await fetch('http://localhost:5008/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Questions generated successfully:', result);
      
      // Reload the script to get new questions (retry to avoid race/caching)
      await loadScriptWithRetry(6, 500);
      
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
          resume_path: resumePath || (resumeFile ? `/Applications/interbuu/uploads/${resumeFile.name}` : null)
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
      
      // Automatically cleanup user data after providing feedback for privacy
      setTimeout(() => {
        cleanupUserData();
      }, 2000); // Small delay to ensure feedback is displayed first
      
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
              <strong>Sample Recommended Answer:</strong>
              {isLoadingSampleAnswer ? (
                <div className="loading-sample">
                  <span>Generating personalized sample answer...</span>
                </div>
              ) : (
                <div className="sample-answer-content">
                  {sampleAnswer || script[currentIndex].answer}
                </div>
              )}
            </div>
          )}

          {/* Live camera preview for confidence only; video is not recorded */}
          <div className="camera-preview" style={{ marginTop: '12px' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '240px', height: '170px', borderRadius: '10px', background: '#000' }}
            />
            <div style={{ fontSize: '0.85em', color: '#666', marginTop: '4px' }}>
              Live preview only (not recorded)
            </div>
            {videoError && (
              <div className="error-message" style={{ marginTop: '6px' }}>{videoError}</div>
            )}
          </div>

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
            </div>
          )}

          {/* Audio playback removed per requirements */}
        </>
      ) : currentIndex >= script.length ? (
        <div className="completion-message">
          <p>🎉 Interview completed successfully!</p>
          <p>All {script.length} questions have been answered and saved.</p>
          <p>Check your responses in the answers.txt file.</p>
          
          <div className="analysis-section">
            {!analysisResult && (
              <div className="analyzing-status">
                <div className="loading-spinner"></div>
                <div>Analyzing your interview... This may take up to ~20 seconds.</div>
              </div>
            )}

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
                
                {/* Removed file/link summary per request */}
                
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
                      {analysisResult.feedback.split('\n\n').map((rawParagraph, index) => {
                        const stripMarkdownBold = (s) => (s || '').replace(/\*\*(.*?)\*\*/g, '$1');
                        const paragraph = stripMarkdownBold((rawParagraph ?? '').replace(/\r/g, ''));
                        const trimmed = paragraph.trim();
                        if (!trimmed) return null;

                        // Headings: allow leading spaces before '#'
                        const headingMatch = trimmed.match(/^#+/);
                        if (headingMatch) {
                          const level = headingMatch[0].length;
                          const text = stripMarkdownBold(trimmed.replace(/^#+\s*/, ''));
                          const HeadingTag = `h${Math.min(level + 2, 6)}`;
                          return React.createElement(HeadingTag, { key: index, className: 'feedback-heading' }, text);
                        }

                        // Bulleted list (allow leading spaces)
                        if (/^[-*]\s+/.test(trimmed)) {
                          const items = paragraph.split('\n').map(i => i.trim()).filter(Boolean);
                          return (
                            <ul key={index} className="feedback-list">
                              {items.map((item, itemIndex) => {
                                const clean = stripMarkdownBold(item.replace(/^[-*]\s+/, ''));
                                return <li key={itemIndex}>{clean}</li>;
                              })}
                            </ul>
                          );
                        }

                        // Numbered list
                        if (/^\d+\.\s+/.test(trimmed)) {
                          const items = paragraph.split('\n').map(i => i.trim()).filter(Boolean);
                          return (
                            <ol key={index} className="feedback-list">
                              {items.map((item, itemIndex) => {
                                const clean = stripMarkdownBold(item.replace(/^\d+\.\s+/, ''));
                                return <li key={itemIndex}>{clean}</li>;
                              })}
                            </ol>
                          );
                        }

                        // Regular paragraph
                        return <p key={index} className="feedback-paragraph">{stripMarkdownBold(paragraph)}</p>;
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

              <div className="job-context-section">
                <h3>🧭 Optional: Target Job Context</h3>
                <p>Paste a job description to tailor questions for a specific role. Leave blank to skip.</p>
                <textarea
                  placeholder="Paste job description (optional)"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={6}
                  style={{ width: '100%', marginTop: '8px' }}
                />
              </div>
              {/* Removed alternate start button and OR divider as requested */}
            </div>
          ) : (
            <div className="welcome-buttons">
              <div className="resume-uploaded">
                ✅ Resume uploaded: {resumeFile?.name}
              </div>

              <div className="job-context-section" style={{ width: '100%', marginTop: '12px' }}>
                <h3>🧭 Optional: Target Job Context</h3>
                <p>Paste a job description or provide a link. If left empty, nothing will be sent.</p>
                <textarea
                  placeholder="Paste job description (optional)"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={5}
                  style={{ width: '100%', marginTop: '8px' }}
                />
              </div>
              
              {/* Removed duplicate Start Interview button (mic emoji) to keep a single start entry point */}
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
            disabled={isGeneratingQuestions || startClicked || script.length === 0}
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
              setStartClicked(false);
            }}
          >
            Restart Interview
          </button>
        )}
        {currentIndex >= 0 && currentIndex < script.length && (
          <button 
            id="recommend" 
            onClick={handleRecommend}
          >
            {showAnswer ? 'Hide Suggested Answer' : 'Show Suggested Answer'}
          </button>
        )}
      </div>

      {script.length > 0 && !isUploadingResume && currentIndex >= 0 && (
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
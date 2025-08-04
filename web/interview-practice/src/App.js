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
    return new Promise((resolve, reject) => {
      const audioReader = new FileReader();
      
      audioReader.onloadend = async () => {
        try {
          const currentQuestion = script[currentIndex].question;
          console.log("Saving response for question:", currentQuestion); // Debug log
          
          const audioBase64 = audioReader.result.split(',')[1];
          const response = await fetch('http://localhost:5008/save-answer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              question: currentQuestion, // Ensure this changes
              answer: userTranscript,
              audio: audioBase64,
              timestamp: new Date().toISOString()
            }),
          });
  
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          const result = await response.json();
          console.log("Save successful:", result); // Debug log
          setUserTranscript('');
          resolve(result);
        } catch (error) {
          console.error('Error saving response:', error);
          setSaveError(`Failed to save response: ${error.message}`);
          reject(error);
        } finally {
          setIsSaving(false);
        }
      };
      
      audioReader.readAsDataURL(audioBlob);
    });
  };
  
  const handleProceed = () => {
    if (isRecording || isSaving) return;
  
    console.log("Handling proceed...");
    console.log("currentIndex:", currentIndex);
    console.log("script length:", script.length);
  
    stopRecording();
    stopSpeaking();
  
    if (currentIndex < script.length - 1) {
      const newIndex = currentIndex + 1;
      console.log("Advancing to question:", newIndex);
      setCurrentIndex(newIndex);
      setShowAnswer(false);
      speakQuestion(script[newIndex].question);
    } else {
      console.log("Reached end of interview");
      setCurrentIndex(-1);
      setShowAnswer(false);
    }
  };
  

  const handleRecommend = () => {
    setShowAnswer(true);
  };

  const handleVolumeChange = (e) => {
    setVolume(parseFloat(e.target.value));
  };

  const getButtonText = () => {
    if (currentIndex === -1) return 'Start Interview';
    if (currentIndex === script.length - 1) return 'Restart Interview';
    return 'Next Question';
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
      
      {currentIndex >= 0 ? (
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
      ) : (
        <div className="welcome-message">
          {script.length > 0 ? (
            <>
              <p>Welcome to your interview practice session!</p>
              <p>Loaded {script.length} questions.</p>
              {!voice && (
                <p className="voice-warning">
                  Note: Text-to-speech may not be available in your browser
                </p>
              )}
            </>
          ) : (
            <p>No questions found in the script.</p>
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
        <button 
          id="proceed" 
          onClick={handleProceed}
          disabled={script.length === 0 || isRecording || isSaving}
        >
          {getButtonText()}
        </button>
        <button 
          id="recommend" 
          onClick={handleRecommend}
          disabled={currentIndex === -1 || showAnswer || isRecording || isSaving}
        >
          Show Suggested Answer
        </button>
      </div>

      {script.length > 0 && (
        <div className="progress">
          <div>
            Question {currentIndex + 1} of {script.length}
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ 
                width: `${currentIndex >= 0 
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
import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [script, setScript] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voice, setVoice] = useState(null);
  const [volume, setVolume] = useState(1.2); // Default increased volume
  const synthRef = useRef(null);
  const utteranceRef = useRef(null);

  useEffect(() => {
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

    // Initialize speech synthesis
    const initSpeech = () => {
      const synth = window.speechSynthesis;
      synthRef.current = synth;
      const voices = synth.getVoices();
      
      if (voices.length > 0) {
        // Voice selection priority:
        // 1. Natural-sounding English voices
        // 2. Google's high-quality voices
        // 3. Any English voice
        const preferredVoice = voices.find(v => 
          v.lang.includes('en') && (v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('David'))
        ) || 
        voices.find(v => 
          v.lang.includes('en') && v.voiceURI.includes('Google')
        ) || 
        voices.find(v => v.lang.includes('en'));
        
        setVoice(preferredVoice || voices[0]);
        console.log('Selected voice:', preferredVoice?.name || voices[0]?.name);
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
    };
  }, []);

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
    
    // Enhanced voice settings
    if (voice.name.includes('Natural') || voice.name.includes('Zira')) {
      utterance.rate = 0.9;  // Slower for clarity
      utterance.pitch = 0.95; // Slightly lower pitch
    } else if (voice.voiceURI.includes('Google')) {
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
    } else {
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
    }
    
    utterance.volume = Math.min(volume, 1.5); // Cap volume at 1.5 for safety
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
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

  const handleProceed = () => {
    stopSpeaking();
    
    if (currentIndex < script.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setShowAnswer(false);
      speakQuestion(script[newIndex].question);
    } else {
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
              <strong>Answer:</strong> {script[currentIndex].answer}
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
          disabled={script.length === 0}
        >
          {getButtonText()}
        </button>
        <button 
          id="recommend" 
          onClick={handleRecommend}
          disabled={currentIndex === -1 || showAnswer}
        >
          Show Answer
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
import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [script, setScript] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

    loadScript();
  }, []);

  const parseScript = (text) => {
    const lines = text.split('\n');
    const parsedScript = [];
    let currentQuestion = null;

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return; // Skip empty lines

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
        // Handle multi-line answers
        currentQuestion.answer += (currentQuestion.answer ? '\n' : '') + trimmedLine;
      }
    });

    // Add the last question if it exists
    if (currentQuestion) parsedScript.push(currentQuestion);

    setScript(parsedScript);
  };

  const handleProceed = () => {
    if (currentIndex < script.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowAnswer(false);
    } else {
      // Restart the interview
      setCurrentIndex(-1);
      setShowAnswer(false);
    }
  };

  const handleRecommend = () => {
    setShowAnswer(true);
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
            </>
          ) : (
            <p>No questions found in the script.</p>
          )}
        </div>
      )}

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
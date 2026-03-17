import React, { useState, useEffect, useRef } from 'react';
import { getStudyTest, submitAnswer } from '../api';
import { checkWrittenAnswer } from '../utils';

export default function TestSession({ sectionId, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const submitted = useRef(false);

  useEffect(() => {
    getStudyTest(sectionId).then(data => {
      setQuestions(data.questions);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [sectionId]);

  if (loading) return <div className="empty-msg">Generating test...</div>;
  if (error) return (
    <div className="study-session">
      <p className="empty-msg">{error}</p>
      <button className="btn" onClick={onBack}>Back to Study</button>
    </div>
  );

  if (done) {
    const correct = results.filter(r => r.correct).length;
    const missed = results.filter(r => !r.correct);

    if (!submitted.current) {
      submitted.current = true;
      (async () => {
        for (const r of results) {
          await submitAnswer({ term_id: r.term_id, quality: r.correct ? 2 : 0 }).catch(console.error);
        }
      })();
    }

    return (
      <div className="study-session">
        <h2>Test Results</h2>
        <div className="test-score">
          {correct} / {results.length} — {Math.round((correct / results.length) * 100)}%
        </div>
        {missed.length > 0 && (
          <div className="test-missed">
            <h3>Missed Terms</h3>
            {missed.map((r, i) => (
              <div key={i} className="test-missed-item">
                <strong>{r.prompt}</strong>
                <span>Correct: {r.correct_answer_display}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '16px' }}>
          Back to Study
        </button>
      </div>
    );
  }

  const q = questions[currentIndex];

  const handleSubmit = () => {
    let correct = false;
    let userAnswer = '';

    if (q.type === 'multiple_choice') {
      correct = selectedAnswer === q.correct_answer;
      userAnswer = selectedAnswer;
    } else if (q.type === 'written') {
      correct = checkWrittenAnswer(userInput, q.correct_answer);
      userAnswer = userInput;
    } else if (q.type === 'true_false') {
      correct = selectedAnswer === q.correct_answer;
      userAnswer = selectedAnswer;
    }

    setResults(prev => [...prev, {
      term_id: q.term_id,
      correct,
      prompt: q.prompt,
      userAnswer,
      correct_answer_display: q.type === 'true_false'
        ? (q.correct_answer ? 'True' : 'False')
        : q.correct_answer,
    }]);
    setRevealed(true);
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setDone(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setUserInput('');
      setRevealed(false);
    }
  };

  const lastResult = revealed && results.length > 0 ? results[results.length - 1] : null;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !revealed && q.type === 'written' && userInput.trim()) {
      handleSubmit();
    }
  };

  return (
    <div className="study-session">
      <div className="study-session-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <span className="study-progress-text">
          Question {currentIndex + 1} of {questions.length}
        </span>
      </div>

      <div className="study-card">
        {q.type === 'multiple_choice' && (
          <>
            <div className="study-card-prompt">{q.prompt}</div>
            <div className="test-options">
              {q.options.map((opt, i) => {
                let cls = 'test-option';
                if (!revealed && selectedAnswer === opt) cls += ' selected';
                if (revealed && opt === q.correct_answer) cls += ' correct-reveal';
                if (revealed && selectedAnswer === opt && opt !== q.correct_answer) cls += ' incorrect-reveal';
                return (
                  <button
                    key={i}
                    className={cls}
                    onClick={() => !revealed && setSelectedAnswer(opt)}
                    disabled={revealed}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {q.type === 'written' && (
          <>
            <div className="study-card-prompt">{q.prompt}</div>
            {!revealed ? (
              <input
                className="study-input"
                type="text"
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                autoFocus
              />
            ) : (
              <div className={`study-input-result ${lastResult?.correct ? 'correct' : 'incorrect'}`}>
                <div>Your answer: {userInput || '(blank)'}</div>
                {!lastResult?.correct && <div>Correct answer: {q.correct_answer}</div>}
              </div>
            )}
          </>
        )}

        {q.type === 'true_false' && (
          <>
            <div className="study-card-prompt">
              <strong>{q.prompt}</strong>
              <div style={{ marginTop: '8px' }}>{q.shown_definition}</div>
            </div>
            <div className="tf-buttons">
              <button
                className={`btn tf-btn ${!revealed && selectedAnswer === true ? 'selected' : ''} ${revealed && q.correct_answer === true ? 'correct-reveal' : ''} ${revealed && selectedAnswer === true && q.correct_answer !== true ? 'incorrect-reveal' : ''}`}
                onClick={() => !revealed && setSelectedAnswer(true)}
                disabled={revealed}
              >
                True
              </button>
              <button
                className={`btn tf-btn ${!revealed && selectedAnswer === false ? 'selected' : ''} ${revealed && q.correct_answer === false ? 'correct-reveal' : ''} ${revealed && selectedAnswer === false && q.correct_answer !== false ? 'incorrect-reveal' : ''}`}
                onClick={() => !revealed && setSelectedAnswer(false)}
                disabled={revealed}
              >
                False
              </button>
            </div>
          </>
        )}

        <div className="study-card-actions">
          {!revealed ? (
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={
                (q.type === 'multiple_choice' && selectedAnswer === null) ||
                (q.type === 'written' && !userInput.trim()) ||
                (q.type === 'true_false' && selectedAnswer === null)
              }
            >
              Submit
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleNext}>
              {currentIndex + 1 >= questions.length ? 'See Results' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

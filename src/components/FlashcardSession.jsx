import React, { useState, useEffect } from 'react';
import { getStudyQueue, submitAnswer } from '../api';

export default function FlashcardSession({ sectionId, onBack }) {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [direction, setDirection] = useState('def_to_term');
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getStudyQueue(sectionId, 'flashcard').then(data => {
      setQueue(data.terms);
      setLoading(false);
      if (data.terms.length === 0) setDone(true);
    }).catch(console.error);
  }, [sectionId]);

  if (loading) return <div className="empty-msg">Loading flashcards...</div>;

  if (done) {
    return (
      <div className="study-session">
        <h2>Session Complete</h2>
        <div className="test-score">
          {sessionStats.correct} / {sessionStats.total} correct
          {sessionStats.total > 0 && (
            <span> — {Math.round((sessionStats.correct / sessionStats.total) * 100)}%</span>
          )}
        </div>
        <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '16px' }}>
          Back to Study
        </button>
      </div>
    );
  }

  const card = queue[currentIndex];
  const prompt = direction === 'def_to_term' ? card.definition : card.term;
  const answer = direction === 'def_to_term' ? card.term : card.definition;

  const handleCheck = () => setRevealed(true);

  const isCorrect = () => userInput.trim().toLowerCase() === answer.trim().toLowerCase();

  const handleQuality = async (quality) => {
    const correct = quality >= 1;
    setSessionStats(s => ({
      correct: s.correct + (correct ? 1 : 0),
      total: s.total + 1,
    }));
    await submitAnswer({ term_id: card.id, quality }).catch(console.error);

    if (currentIndex + 1 >= queue.length) {
      setDone(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setUserInput('');
      setRevealed(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !revealed) handleCheck();
  };

  return (
    <div className="study-session">
      <div className="study-session-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <span className="study-progress-text">Card {currentIndex + 1} of {queue.length}</span>
        <button
          className="btn btn-sm"
          onClick={() => setDirection(d => d === 'def_to_term' ? 'term_to_def' : 'def_to_term')}
          title="Switch direction"
        >
          Flip direction
        </button>
      </div>

      <div className="study-card">
        <div className="study-card-prompt">{prompt}</div>

        {!revealed ? (
          <div className="study-card-input-area">
            <input
              className="study-input"
              type="text"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={direction === 'def_to_term' ? 'Type the term...' : 'Type the definition...'}
              autoFocus
            />
            <button className="btn btn-primary" onClick={handleCheck}>Check</button>
          </div>
        ) : (
          <div className="study-card-reveal">
            <div className={`study-input-result ${isCorrect() ? 'correct' : 'incorrect'}`}>
              <div>Your answer: {userInput || '(blank)'}</div>
              {!isCorrect() && <div>Correct answer: {answer}</div>}
            </div>
            <div className="quality-buttons">
              <button className={`btn quality-btn q-again ${!isCorrect() ? 'suggested' : ''}`} onClick={() => handleQuality(0)}>
                Again (0)
              </button>
              <button className="btn quality-btn q-hard" onClick={() => handleQuality(1)}>Hard (1)</button>
              <button className={`btn quality-btn q-good ${isCorrect() ? 'suggested' : ''}`} onClick={() => handleQuality(2)}>
                Good (2)
              </button>
              <button className="btn quality-btn q-easy" onClick={() => handleQuality(3)}>Easy (3)</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

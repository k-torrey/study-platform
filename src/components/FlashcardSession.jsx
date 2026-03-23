import React, { useState, useEffect } from 'react';
import { getStudyQueue, submitAnswer } from '../api';

export default function FlashcardSession({ sectionId, onBack }) {
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState('term_to_def');
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ got: 0, practice: 0 });

  useEffect(() => {
    getStudyQueue(sectionId, 'flashcard').then(data => {
      setQueue(data.terms);
      setLoading(false);
      if (data.terms.length === 0) setDone(true);
    }).catch(console.error);
  }, [sectionId]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      }
      if (flipped && e.key === 'ArrowRight') advance(2);
      if (flipped && e.key === 'ArrowLeft') advance(0);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flipped, currentIndex, queue.length]);

  function advance(quality) {
    submitAnswer({ term_id: queue[currentIndex].id, quality }).catch(console.error);
    setStats(s => quality >= 2
      ? { ...s, got: s.got + 1 }
      : { ...s, practice: s.practice + 1 }
    );

    if (currentIndex + 1 >= queue.length) {
      setDone(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setFlipped(false);
    }
  }

  if (loading) {
    return (
      <div className="study-session">
        <div className="skeleton skeleton-block" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="study-session">
        <h2>Session Complete!</h2>
        <div className="flashcard-results">
          <div className="flashcard-result-stat got-it">
            <span className="flashcard-result-num">{stats.got}</span>
            <span>Got it</span>
          </div>
          <div className="flashcard-result-stat needs-practice">
            <span className="flashcard-result-num">{stats.practice}</span>
            <span>Needs practice</span>
          </div>
        </div>
        <div className="text-center mt-4">
          <button className="btn btn-primary" onClick={onBack}>Back to Study</button>
        </div>
      </div>
    );
  }

  const card = queue[currentIndex];
  const front = direction === 'term_to_def' ? card.term : card.definition;
  const back = direction === 'term_to_def' ? card.definition : card.term;
  const frontLabel = direction === 'term_to_def' ? 'Term' : 'Definition';
  const backLabel = direction === 'term_to_def' ? 'Definition' : 'Term';
  const progressPct = ((currentIndex + 1) / queue.length * 100).toFixed(0);

  return (
    <div className="study-session">
      <div className="study-session-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <span className="study-progress-text">{currentIndex + 1} / {queue.length}</span>
        <button
          className="btn btn-sm"
          onClick={() => { setDirection(d => d === 'term_to_def' ? 'def_to_term' : 'term_to_def'); setFlipped(false); }}
        >
          Flip direction
        </button>
      </div>

      <div className="study-session-progress-bar">
        <div className="study-session-progress-bar-fill" style={{ width: progressPct + '%' }} />
      </div>

      <div
        className={`flashcard ${flipped ? 'flashcard-flipped' : ''}`}
        onClick={() => setFlipped(f => !f)}
      >
        <div className="flashcard-inner">
          <div className="flashcard-front">
            <span className="flashcard-label">{frontLabel}</span>
            <div className="flashcard-text">{front || '(no content)'}</div>
            <span className="flashcard-hint">Tap to flip</span>
          </div>
          <div className="flashcard-back">
            <span className="flashcard-label">{backLabel}</span>
            <div className="flashcard-text">{back || '(no content)'}</div>
          </div>
        </div>
      </div>

      <div className="flashcard-actions mt-4">
        <button className="btn flashcard-btn-practice" onClick={() => advance(0)}>
          Needs Practice
        </button>
        <button className="btn flashcard-btn-got" onClick={() => advance(2)}>
          Got It
        </button>
      </div>
    </div>
  );
}

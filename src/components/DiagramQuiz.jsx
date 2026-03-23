import React, { useState, useEffect } from 'react';
import { getTerms } from '../api';

export default function DiagramQuiz({ sectionId, onBack }) {
  const [terms, setTerms] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ got: 0, practice: 0 });

  useEffect(() => {
    getTerms(sectionId).then(all => {
      const withImages = all.filter(t => t.image_url && t.image_url !== '');
      setTerms(withImages);
      // Shuffle
      const shuffled = [...withImages].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      setLoading(false);
      if (shuffled.length === 0) setDone(true);
    }).catch(console.error);
  }, [sectionId]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      }
      if (flipped && e.key === 'ArrowRight') advance(true);
      if (flipped && e.key === 'ArrowLeft') advance(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [flipped, currentIndex, queue.length]);

  function advance(gotIt) {
    setStats(s => gotIt ? { ...s, got: s.got + 1 } : { ...s, practice: s.practice + 1 });
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

  if (done && queue.length === 0) {
    return (
      <div className="study-session">
        <h2>No Diagrams Available</h2>
        <p className="empty-msg">
          None of your terms have images yet. Go to the Diagrams tab to add image sources and match them to your terms.
        </p>
        <div className="text-center mt-4">
          <button className="btn btn-primary" onClick={onBack}>Back to Study</button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="study-session">
        <h2>Diagram Quiz Complete!</h2>
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
  const progressPct = ((currentIndex + 1) / queue.length * 100).toFixed(0);

  return (
    <div className="study-session">
      <div className="study-session-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <span className="study-progress-text">{currentIndex + 1} / {queue.length}</span>
      </div>

      <div className="study-session-progress-bar">
        <div className="study-session-progress-bar-fill" style={{ width: progressPct + '%' }} />
      </div>

      <div
        className={`diagram-quiz-card ${flipped ? 'diagram-quiz-flipped' : ''}`}
        onClick={() => setFlipped(f => !f)}
      >
        <div className="diagram-quiz-inner">
          <div className="diagram-quiz-front">
            <span className="flashcard-label">Term</span>
            <div className="flashcard-text">{card.term}</div>
            <span className="flashcard-hint">Tap to see diagram</span>
          </div>
          <div className="diagram-quiz-back">
            <span className="flashcard-label">Diagram</span>
            <div className="diagram-quiz-image">
              <img src={card.image_url} alt={card.term} />
            </div>
            <div className="diagram-quiz-term">{card.term}</div>
          </div>
        </div>
      </div>

      <div className="flashcard-actions mt-4">
        <button className="btn flashcard-btn-practice" onClick={() => advance(false)}>
          Needs Practice
        </button>
        <button className="btn flashcard-btn-got" onClick={() => advance(true)}>
          Got It
        </button>
      </div>
    </div>
  );
}

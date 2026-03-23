import React, { useState, useEffect } from 'react';
import { getStudyQueue, submitAnswer } from '../api';

export default function LearnSession({ sectionId, onBack }) {
  const [batch, setBatch] = useState([]);
  const [phase, setPhase] = useState('intro');
  const [introIndex, setIntroIndex] = useState(0);
  const [drillQueue, setDrillQueue] = useState([]);
  const [hits, setHits] = useState({});
  const [userInput, setUserInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const loadBatch = () => {
    setLoading(true);
    getStudyQueue(sectionId, 'learn').then(data => {
      if (data.terms.length === 0) {
        setBatch([]);
        setPhase('done');
        setLoading(false);
        return;
      }
      setBatch(data.terms);
      setPhase('intro');
      setIntroIndex(0);
      setHits({});
      setUserInput('');
      setRevealed(false);
      setLoading(false);
    }).catch(console.error);
  };

  useEffect(() => { loadBatch(); }, [sectionId]);

  const startDrill = () => {
    const shuffled = [...batch].sort(() => Math.random() - 0.5);
    setDrillQueue(shuffled);
    setPhase('drill');
    setUserInput('');
    setRevealed(false);
  };

  const handleCheck = () => setRevealed(true);

  const processAnswer = (correct) => {
    const current = drillQueue[0];
    const newHits = { ...hits };

    if (correct) {
      newHits[current.id] = (newHits[current.id] || 0) + 1;
    } else {
      newHits[current.id] = 0;
    }
    setHits(newHits);

    const rest = drillQueue.slice(1);
    const isMastered = newHits[current.id] >= 2;

    let next;
    if (!isMastered) {
      const insertPos = Math.floor(Math.random() * (rest.length + 1));
      next = [...rest.slice(0, insertPos), current, ...rest.slice(insertPos)];
    } else {
      next = rest;
    }

    next = next.filter(t => (newHits[t.id] || 0) < 2);

    if (next.length === 0) {
      finishBatch();
    } else {
      setDrillQueue(next);
      setUserInput('');
      setRevealed(false);
    }
  };

  const finishBatch = async () => {
    for (const term of batch) {
      await submitAnswer({ term_id: term.id, quality: 2 }).catch(console.error);
    }
    const data = await getStudyQueue(sectionId, 'learn').catch(() => ({ terms: [] }));
    setHasMore(data.terms && data.terms.length > 0);
    setPhase('done');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !revealed) handleCheck();
  };

  if (loading) {
    return (
      <div className="study-session">
        <div className="skeleton skeleton-block" />
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="study-session">
        <h2>Batch Complete!</h2>
        <p className="empty-msg">
          {batch.length > 0
            ? `You learned ${batch.length} terms in this batch.`
            : 'No unseen terms remaining. Great job!'
          }
        </p>
        <div className="flex-center gap-2 mt-4">
          {hasMore && (
            <button className="btn btn-primary" onClick={loadBatch}>Next Batch</button>
          )}
          <button className="btn" onClick={onBack}>Back to Study</button>
        </div>
      </div>
    );
  }

  if (phase === 'intro') {
    const card = batch[introIndex];
    const progressPct = ((introIndex + 1) / batch.length * 100).toFixed(0);
    return (
      <div className="study-session">
        <div className="study-session-header">
          <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
          <span className="study-progress-text">Preview {introIndex + 1} of {batch.length}</span>
        </div>
        <div className="study-session-progress-bar">
          <div className="study-session-progress-bar-fill" style={{ width: progressPct + '%' }} />
        </div>
        <div className="study-card">
          <div className="study-card-term">{card.term}</div>
          <div className="study-card-definition">{card.definition}</div>
          <div className="mt-4">
            <button
              className="btn btn-primary"
              onClick={() => {
                if (introIndex + 1 >= batch.length) {
                  startDrill();
                } else {
                  setIntroIndex(introIndex + 1);
                }
              }}
            >
              {introIndex + 1 >= batch.length ? 'Start Drill' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Drill phase
  const current = drillQueue[0];
  const isCorrect = userInput.trim().toLowerCase() === current.term.trim().toLowerCase();
  const masteredCount = Object.values(hits).filter(h => h >= 2).length;

  return (
    <div className="study-session">
      <div className="study-session-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <span className="study-progress-text">
          {masteredCount} / {batch.length} mastered &middot; {drillQueue.length} remaining
        </span>
      </div>
      <div className="study-card">
        <div className="study-card-prompt">{current.definition}</div>

        {!revealed ? (
          <div className="study-card-input-area">
            <input
              className="study-input"
              type="text"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type the term..."
              autoFocus
            />
            <div className="flex-row">
              <button className="btn btn-primary" onClick={handleCheck}>Check</button>
              <button className="btn" onClick={() => setRevealed(true)}>Skip</button>
            </div>
          </div>
        ) : (
          <div className="study-card-reveal">
            <div className={`study-input-result ${isCorrect ? 'correct' : 'incorrect'}`}>
              <div>Your answer: {userInput || '(blank)'}</div>
              {!isCorrect && <div>Correct answer: {current.term}</div>}
            </div>
            <div className="mt-3">
              <button className="btn btn-primary" onClick={() => processAnswer(isCorrect)}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { resetStudyProgress } from '../api';

export default function StudyLauncher({ sectionId, progress, onSelectMode, onProgressChange }) {
  const [showTable, setShowTable] = useState(false);
  const [filter, setFilter] = useState('all');
  const [confirming, setConfirming] = useState(false);

  const { total, mastered, reviewing, learning, unseen, due_count, terms } = progress;

  const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : 0;

  const filteredTerms = filter === 'all'
    ? terms
    : terms.filter(t => t.status === filter);

  const handleReset = async () => {
    await resetStudyProgress({ section_id: sectionId });
    setConfirming(false);
    onProgressChange();
  };

  return (
    <div className="study-launcher">
      <h2>Study</h2>

      <div className="study-progress-bar">
        {mastered > 0 && <div className="sp-seg sp-mastered" style={{ width: pct(mastered) + '%' }} />}
        {reviewing > 0 && <div className="sp-seg sp-reviewing" style={{ width: pct(reviewing) + '%' }} />}
        {learning > 0 && <div className="sp-seg sp-learning" style={{ width: pct(learning) + '%' }} />}
        {unseen > 0 && <div className="sp-seg sp-unseen" style={{ width: pct(unseen) + '%' }} />}
      </div>
      <div className="study-stats">
        <span className="stat-mastered">{mastered} mastered</span>
        <span className="stat-sep">&middot;</span>
        <span className="stat-reviewing">{reviewing} reviewing</span>
        <span className="stat-sep">&middot;</span>
        <span className="stat-learning">{learning} learning</span>
        <span className="stat-sep">&middot;</span>
        <span className="stat-unseen">{unseen} unseen</span>
      </div>

      <div className="study-modes">
        <button className="study-mode-card" onClick={() => onSelectMode('flashcard')}>
          <div className="smc-title">Flashcards</div>
          <div className="smc-desc">Review due terms with spaced repetition</div>
          {due_count > 0 && <span className="badge badge-due">{due_count} due</span>}
        </button>
        <button className="study-mode-card" onClick={() => onSelectMode('learn')}>
          <div className="smc-title">Learn</div>
          <div className="smc-desc">Learn 7 new terms at a time</div>
          {unseen > 0 && <span className="badge badge-unseen">{unseen} unseen</span>}
        </button>
        <button className="study-mode-card" onClick={() => onSelectMode('test')}>
          <div className="smc-title">Test</div>
          <div className="smc-desc">Mixed question quiz (MC, written, T/F)</div>
          <span className="badge">{total} terms</span>
        </button>
        <button className="study-mode-card" onClick={() => setShowTable(!showTable)}>
          <div className="smc-title">View Progress</div>
          <div className="smc-desc">See detailed progress for each term</div>
        </button>
      </div>

      {showTable && (
        <div className="study-progress-detail">
          <div className="progress-filters">
            {['all', 'mastered', 'reviewing', 'learning', 'unseen'].map(f => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <table className="progress-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Status</th>
                <th>Correct</th>
                <th>Incorrect</th>
                <th>Accuracy</th>
                <th>Next Review</th>
              </tr>
            </thead>
            <tbody>
              {filteredTerms.map(t => {
                const totalAttempts = t.correct_count + t.incorrect_count;
                const accuracy = totalAttempts > 0
                  ? Math.round((t.correct_count / totalAttempts) * 100) + '%'
                  : '-';
                const nextReview = t.next_review
                  ? new Date(t.next_review).toLocaleDateString()
                  : '-';
                return (
                  <tr key={t.id}>
                    <td>{t.term}</td>
                    <td><span className={`status-badge status-${t.status}`}>{t.status}</span></td>
                    <td>{t.correct_count}</td>
                    <td>{t.incorrect_count}</td>
                    <td>{accuracy}</td>
                    <td>{nextReview}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '12px' }}>
            {!confirming ? (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
                Reset Progress
              </button>
            ) : (
              <span>
                Are you sure?{' '}
                <button className="btn btn-danger btn-sm" onClick={handleReset}>Yes, reset all</button>{' '}
                <button className="btn btn-sm" onClick={() => setConfirming(false)}>Cancel</button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { getSections, createSection, deleteSection } from '../api';

export default function ExamPage({ examId, examName, courseId, onSelectSection, onRefresh }) {
  const [sections, setSections] = useState(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadSections();
  }, [examId]);

  function loadSections() {
    getSections(examId).then(setSections).catch(console.error);
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createSection(examId, { name: newName.trim() });
    setNewName('');
    setAdding(false);
    loadSections();
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this section?')) return;
    await deleteSection(id);
    loadSections();
  }

  // Loading skeleton
  if (sections === null) {
    return (
      <div>
        <div className="page-header">
          <h2>{examName}</h2>
        </div>
        <div className="section-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{examName}</h2>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          + Section
        </button>
      </div>

      <div className="section-list">
        {sections.map(s => (
          <div key={s.id} className="section-row" onClick={() => onSelectSection(s.id, s.name)}>
            <div className="section-row-left">
              <span className="section-row-name">{s.name}</span>
              <span className="section-row-count">{s.term_count} term{s.term_count !== 1 ? 's' : ''}</span>
            </div>
            <div className="section-row-actions">
              <button className="btn btn-sm btn-danger" onClick={(e) => handleDelete(e, s.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <form className="inline-add" onSubmit={handleAdd}>
          <input
            autoFocus
            placeholder="Section name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Add</button>
          <button type="button" className="btn" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
        </form>
      )}

      {sections.length === 0 && !adding && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <h2>No sections yet</h2>
          <p>Add sections to organize terms, notes, and textbook references within this exam.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Section</button>
        </div>
      )}
    </div>
  );
}

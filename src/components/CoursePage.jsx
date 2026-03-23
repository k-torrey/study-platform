import React, { useState, useEffect } from 'react';
import { getExams, createExam, updateExam, deleteExam } from '../api';
import Modal from './Modal';
import TextbookManager from './TextbookManager';

export default function CoursePage({ courseId, courseName, onSelectExam, onRefresh }) {
  const [exams, setExams] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [showTextbooks, setShowTextbooks] = useState(false);

  useEffect(() => {
    loadExams();
  }, [courseId]);

  function loadExams() {
    getExams(courseId).then(setExams).catch(console.error);
  }

  function openCreate() {
    setEditing(null);
    setName('');
    setDate('');
    setShowModal(true);
  }

  function openEdit(e, exam) {
    e.stopPropagation();
    setEditing(exam);
    setName(exam.name);
    setDate(exam.date || '');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    if (editing) {
      await updateExam(editing.id, { name: name.trim(), date: date || null });
    } else {
      await createExam(courseId, { name: name.trim(), date: date || null });
    }
    setShowModal(false);
    setEditing(null);
    loadExams();
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this exam and all its sections?')) return;
    await deleteExam(id);
    loadExams();
  }

  // Loading skeleton
  if (exams === null) {
    return (
      <div>
        <div className="page-header">
          <h2>{courseName}</h2>
        </div>
        <div className="card-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>{courseName}</h2>
        <div className="flex-row">
          <button className="btn" onClick={() => setShowTextbooks(!showTextbooks)}>
            Textbooks
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + Exam
          </button>
        </div>
      </div>

      {showTextbooks && (
        <TextbookManager courseId={courseId} />
      )}

      <div className="card-grid">
        {exams.map(e => (
          <div key={e.id} className="card" onClick={() => onSelectExam(e.id, e.name)}>
            <div className="card-body">
              <h3>{e.name}</h3>
              {e.date && <p>{new Date(e.date).toLocaleDateString()}</p>}
              <div className="card-stats">
                <span>{e.section_count} section{e.section_count !== 1 ? 's' : ''}</span>
                <span>{e.term_count} term{e.term_count !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="card-actions">
              <button className="btn btn-sm btn-ghost" onClick={(ev) => openEdit(ev, e)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={(ev) => handleDelete(ev, e.id)}>Delete</button>
            </div>
          </div>
        ))}

        <div className="card card-new" onClick={openCreate}>
          + New Exam
        </div>
      </div>

      {exams.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <h2>No exams yet</h2>
          <p>Create your first exam to start organizing your study material.</p>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Exam</button>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Exam' : 'New Exam'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Name</label>
              <input
                autoFocus
                placeholder="e.g. Exam 1"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Date (optional)</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

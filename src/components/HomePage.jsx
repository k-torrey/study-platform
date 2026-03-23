import React, { useState, useEffect } from 'react';
import { getCourses, createCourse, updateCourse, deleteCourse } from '../api';
import Modal from './Modal';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#64748b'];

export default function HomePage({ onSelectCourse, onRefresh }) {
  const [courses, setCourses] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#6366f1');

  useEffect(() => {
    getCourses().then(setCourses).catch(console.error);
  }, []);

  function openCreate() {
    setEditing(null);
    setName('');
    setTitle('');
    setColor('#6366f1');
    setShowModal(true);
  }

  function openEdit(e, course) {
    e.stopPropagation();
    setEditing(course);
    setName(course.name);
    setTitle(course.title || '');
    setColor(course.color || '#6366f1');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    if (editing) {
      await updateCourse(editing.id, { name: name.trim(), title: title.trim(), color });
    } else {
      await createCourse({ name: name.trim(), title: title.trim(), color });
    }
    setShowModal(false);
    setEditing(null);
    const updated = await getCourses();
    setCourses(updated);
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!confirm('Delete this course and all its data?')) return;
    await deleteCourse(id);
    const updated = await getCourses();
    setCourses(updated);
  }

  // Loading skeleton
  if (courses === null) {
    return (
      <div>
        <div className="page-header">
          <h2>Courses</h2>
        </div>
        <div className="card-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  const totalTerms = courses.reduce((sum, c) => sum + (c.term_count || 0), 0);
  const totalExams = courses.reduce((sum, c) => sum + (c.exam_count || 0), 0);

  return (
    <div>
      {courses.length > 0 && (
        <div className="welcome-banner">
          <div>
            <h2>Welcome back!</h2>
            <p>You have {totalTerms} term{totalTerms !== 1 ? 's' : ''} across {totalExams} exam{totalExams !== 1 ? 's' : ''} in {courses.length} course{courses.length !== 1 ? 's' : ''}.</p>
          </div>
        </div>
      )}

      <div className="page-header">
        <h2>Courses</h2>
      </div>

      <div className="card-grid">
        {courses.map(c => (
          <div key={c.id} className="card" onClick={() => onSelectCourse(c.id, c.name)}>
            <div className="card-color-header" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }} />
            <div className="card-body">
              <h3>{c.name}</h3>
              {c.title && <p>{c.title}</p>}
              <div className="card-stats">
                <span>{c.exam_count} exam{c.exam_count !== 1 ? 's' : ''}</span>
                <span>{c.term_count} term{c.term_count !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="card-actions">
              <button className="btn btn-sm btn-ghost" onClick={(e) => openEdit(e, c)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={(e) => handleDelete(e, c.id)}>Delete</button>
            </div>
          </div>
        ))}

        <div className="card card-new" onClick={openCreate}>
          + New Course
        </div>
      </div>

      {showModal && (
        <Modal title={editing ? 'Edit Course' : 'New Course'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Course Code</label>
              <input
                autoFocus
                placeholder="e.g. BIO327"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Title (optional)</label>
              <input
                placeholder="e.g. Human Anatomy"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Color</label>
              <div className="color-picker">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
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

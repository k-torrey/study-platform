import React, { useState, useEffect } from 'react';
import { getTextbooks, uploadTextbook, pasteTextbook, deleteTextbook } from '../api';
import Modal from './Modal';

export default function TextbookManager({ courseId }) {
  const [textbooks, setTextbooks] = useState([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTextbooks();
  }, [courseId]);

  function loadTextbooks() {
    getTextbooks(courseId).then(setTextbooks).catch(console.error);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'epub'].includes(ext)) {
      alert('Only PDF and EPUB files are supported.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('File must be under 50MB.');
      return;
    }

    setUploading(true);
    try {
      await uploadTextbook(courseId, file);
      loadTextbooks();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handlePaste(e) {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteContent.trim()) return;
    await pasteTextbook(courseId, { title: pasteTitle.trim(), content: pasteContent.trim() });
    setShowPaste(false);
    setPasteTitle('');
    setPasteContent('');
    loadTextbooks();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this textbook?')) return;
    await deleteTextbook(id);
    loadTextbooks();
  }

  return (
    <div className="textbook-manager" style={{ marginBottom: '24px' }}>
      <h2>Textbooks</h2>

      <div className="textbook-list">
        {textbooks.map(tb => (
          <div key={tb.id} className="textbook-item">
            <div className="textbook-item-info">
              <h4>{tb.title}</h4>
              <span>{tb.chapter_count} chapter{tb.chapter_count !== 1 ? 's' : ''} · {tb.type}</span>
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(tb.id)}>Delete</button>
          </div>
        ))}
        {textbooks.length === 0 && (
          <p className="empty-msg" style={{ padding: '12px' }}>No textbooks yet. Upload a PDF/EPUB or paste text.</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {uploading ? 'Uploading...' : 'Upload PDF/EPUB'}
          <input type="file" accept=".pdf,.epub" onChange={handleUpload} hidden disabled={uploading} />
        </label>
        <button className="btn" onClick={() => setShowPaste(true)}>Paste Text</button>
      </div>

      {showPaste && (
        <Modal title="Paste Textbook Content" onClose={() => setShowPaste(false)}>
          <form onSubmit={handlePaste}>
            <div className="form-group">
              <label>Title</label>
              <input
                autoFocus
                placeholder="e.g. Chapter 5 - The Arm"
                value={pasteTitle}
                onChange={e => setPasteTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Content</label>
              <textarea
                placeholder="Paste textbook text here..."
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
                rows={8}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowPaste(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getNotes, saveNotes } from '../api';

export default function NotesTab({ sectionId }) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    getNotes(sectionId).then(data => {
      setContent(data.content || '');
      setLoaded(true);
    }).catch(console.error);
  }, [sectionId]);

  const doSave = useCallback(async (text) => {
    setStatus('Saving...');
    try {
      await saveNotes(sectionId, text);
      setStatus('Saved');
    } catch {
      setStatus('Error saving');
    }
  }, [sectionId]);

  function handleChange(e) {
    const val = e.target.value;
    setContent(val);
    setStatus('Unsaved changes');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSave(val), 800);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!loaded) return <div className="empty-msg">Loading notes...</div>;

  return (
    <div className="notes-editor">
      <textarea
        className="notes-textarea"
        value={content}
        onChange={handleChange}
        placeholder="Start typing your notes..."
      />
      <div className="notes-status">{status}</div>
    </div>
  );
}

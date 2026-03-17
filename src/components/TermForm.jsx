import React, { useState } from 'react';
import { createTerm, updateTerm } from '../api';

export default function TermForm({ sectionId, existing, onSaved, onCancel }) {
  const [term, setTerm] = useState(existing?.term || '');
  const [definition, setDefinition] = useState(existing?.definition || '');
  const [notes, setNotes] = useState(existing?.notes || '');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!term.trim() || !definition.trim()) return;

    if (existing) {
      await updateTerm(existing.id, { term: term.trim(), definition: definition.trim(), notes: notes.trim() });
    } else {
      await createTerm({ section_id: sectionId, term: term.trim(), definition: definition.trim(), notes: notes.trim() });
    }
    onSaved();
  }

  return (
    <form className="term-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        placeholder="Term"
        value={term}
        onChange={e => setTerm(e.target.value)}
        required
      />
      <textarea
        placeholder="Definition"
        value={definition}
        onChange={e => setDefinition(e.target.value)}
        rows={2}
        required
      />
      <input
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {existing ? 'Update' : 'Add'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

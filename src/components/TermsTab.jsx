import React, { useState, useEffect } from 'react';
import { getTerms, deleteTerm, uploadTermImage, removeTermImage } from '../api';
import TermForm from './TermForm';
import BulkImport from './BulkImport';
import ImageSearch from './ImageSearch';

function TermImage({ term, onUpdate, onSearchImages }) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Only JPG, PNG, GIF, and WebP images are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      await uploadTermImage(term.id, file);
      onUpdate();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemove(e) {
    e.stopPropagation();
    try {
      await removeTermImage(term.id);
      onUpdate();
    } catch (err) {
      alert('Failed to remove image: ' + err.message);
    }
  }

  if (term.image_url) {
    return (
      <div className="term-image-container">
        <img src={term.image_url} alt={term.term} className="term-image" />
        <button className="term-image-remove" onClick={handleRemove} title="Remove image">&times;</button>
      </div>
    );
  }

  return (
    <div className="term-image-options">
      <label className="term-image-upload" title="Upload image">
        {uploading ? (
          <span className="term-image-uploading">...</span>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="16" height="16" rx="2" />
              <circle cx="7" cy="7" r="1.5" />
              <path d="M2 14l4-4 3 3 4-5 5 6" />
            </svg>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleUpload}
              hidden
            />
          </>
        )}
      </label>
      <button className="term-image-search-btn" onClick={onSearchImages} title="Search for images online">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="9" cy="9" r="6" />
          <path d="M13.5 13.5L17 17" />
        </svg>
      </button>
    </div>
  );
}

export default function TermsTab({ sectionId, onFindInTextbook }) {
  const [terms, setTerms] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [imageSearchTerm, setImageSearchTerm] = useState(null);

  useEffect(() => {
    loadTerms();
  }, [sectionId]);

  function loadTerms() {
    getTerms(sectionId).then(setTerms).catch(console.error);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this term?')) return;
    await deleteTerm(id);
    loadTerms();
  }

  return (
    <div className="term-list">
      <div className="term-list-header">
        <h2>Terms ({terms.length})</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => { setShowBulk(!showBulk); setShowAdd(false); }}>
            Bulk Import
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditingId(null); setShowBulk(false); }}>
            + Add Term
          </button>
        </div>
      </div>

      {showAdd && (
        <TermForm
          sectionId={sectionId}
          onSaved={() => { setShowAdd(false); loadTerms(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {showBulk && (
        <BulkImport
          sectionId={sectionId}
          onImported={() => { setShowBulk(false); loadTerms(); }}
        />
      )}

      {terms.length === 0 && !showAdd && !showBulk && (
        <p className="empty-msg">No terms yet. Add one or use Bulk Import.</p>
      )}

      {terms.map(t => (
        <div key={t.id} className="term-card">
          {editingId === t.id ? (
            <TermForm
              sectionId={sectionId}
              existing={t}
              onSaved={() => { setEditingId(null); loadTerms(); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="term-card-row">
              <div className="term-card-left">
                <div className="term-card-body" onClick={() => setEditingId(t.id)}>
                  <div className="term-word">{t.term}</div>
                  <div className="term-def">{t.definition}</div>
                  {t.notes && <div className="term-notes">{t.notes}</div>}
                </div>
                <div className="term-card-actions">
                  <button className="btn btn-sm" onClick={() => setEditingId(t.id)}>Edit</button>
                  {onFindInTextbook && (
                    <button className="btn btn-sm" onClick={() => onFindInTextbook(t.id, t.term)}>
                      Find in Textbook
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                </div>
              </div>
              <div className="term-card-right">
                <TermImage
                  term={t}
                  onUpdate={loadTerms}
                  onSearchImages={() => setImageSearchTerm(t)}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      {imageSearchTerm && (
        <ImageSearch
          term={imageSearchTerm}
          onSelected={() => { setImageSearchTerm(null); loadTerms(); }}
          onClose={() => setImageSearchTerm(null)}
        />
      )}
    </div>
  );
}

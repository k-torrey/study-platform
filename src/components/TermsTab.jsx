import React, { useState, useEffect } from 'react';
import { getTerms, deleteTerm, uploadTermImage, removeTermImage, autoFillDefinition, clearAllDefinitions } from '../api';
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

export default function TermsTab({ sectionId, courseId, onFindInTextbook }) {
  const [terms, setTerms] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [imageSearchTerm, setImageSearchTerm] = useState(null);

  // Auto-fill state
  const [filling, setFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState({ current: 0, total: 0, found: 0, skipped: 0 });

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

  async function handleAutoFill() {
    const needsFilling = terms.filter(t => !t.definition || !t.definition.trim());
    if (needsFilling.length === 0) {
      alert('All terms already have definitions.');
      return;
    }

    if (!courseId) {
      alert('Course context required for auto-fill.');
      return;
    }

    const msg = needsFilling.length === terms.length
      ? `Auto-fill definitions for all ${needsFilling.length} terms from your textbook?`
      : `${needsFilling.length} term${needsFilling.length > 1 ? 's' : ''} missing definitions. Auto-fill from your textbook?`;

    if (!confirm(msg)) return;

    setFilling(true);
    setFillProgress({ current: 0, total: needsFilling.length, found: 0, skipped: 0 });

    let found = 0;
    let skipped = 0;

    for (let i = 0; i < needsFilling.length; i++) {
      const t = needsFilling[i];
      try {
        const definition = await autoFillDefinition(t.id, t.term, courseId);
        if (definition) {
          found++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
      setFillProgress({ current: i + 1, total: needsFilling.length, found, skipped });
    }

    setFilling(false);
    loadTerms();
  }

  const emptyDefCount = terms.filter(t => !t.definition || !t.definition.trim()).length;
  const hasDefCount = terms.filter(t => t.definition && t.definition.trim()).length;

  async function handleClearDefinitions() {
    if (!confirm(`Clear all definitions for ${hasDefCount} terms? The terms themselves will be kept.`)) return;
    await clearAllDefinitions(sectionId);
    setFillProgress({ current: 0, total: 0, found: 0, skipped: 0 });
    loadTerms();
  }

  return (
    <div className="term-list">
      <div className="term-list-header">
        <h2>Terms ({terms.length})</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {emptyDefCount > 0 && !filling && (
            <button className="btn btn-primary" onClick={handleAutoFill}>
              Auto-fill Definitions ({emptyDefCount})
            </button>
          )}
          {hasDefCount > 0 && !filling && (
            <button className="btn btn-danger" onClick={handleClearDefinitions}>
              Clear Definitions
            </button>
          )}
          <button className="btn" onClick={() => { setShowBulk(!showBulk); setShowAdd(false); }}>
            Bulk Import
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditingId(null); setShowBulk(false); }}>
            + Add Term
          </button>
        </div>
      </div>

      {/* Auto-fill progress */}
      {filling && (
        <div className="autofill-progress">
          <div className="autofill-bar">
            <div
              className="autofill-bar-fill"
              style={{ width: `${(fillProgress.current / fillProgress.total) * 100}%` }}
            />
          </div>
          <p className="autofill-status">
            Finding definitions... {fillProgress.current} / {fillProgress.total}
            {fillProgress.found > 0 && <span className="autofill-found"> — {fillProgress.found} found</span>}
            {fillProgress.skipped > 0 && <span className="autofill-skipped"> — {fillProgress.skipped} not found</span>}
          </p>
        </div>
      )}

      {/* Auto-fill results summary */}
      {!filling && fillProgress.total > 0 && (
        <div className="autofill-done">
          Done! Found definitions for {fillProgress.found} of {fillProgress.total} terms.
          {fillProgress.skipped > 0 && ` ${fillProgress.skipped} could not be found in your textbook — you can add these manually or use "Find in Textbook".`}
        </div>
      )}

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
        <div key={t.id} className={`term-card ${!t.definition?.trim() ? 'term-card-no-def' : ''}`}>
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
                  <div className="term-def">
                    {t.definition?.trim() || <span className="term-no-def">No definition — click Edit or use Auto-fill</span>}
                  </div>
                  {t.notes && t.notes.startsWith('Source:') ? (
                    <div className="term-source">{t.notes}</div>
                  ) : t.notes ? (
                    <div className="term-notes">{t.notes}</div>
                  ) : null}
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

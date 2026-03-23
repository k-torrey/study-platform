import React, { useState, useEffect } from 'react';
import { getTerms, getCourseImages, fetchImageSource, matchDiagramsToTerms, deleteCourseImages } from '../api';
import ImageSearch from './ImageSearch';

export default function DiagramsTab({ sectionId, courseId }) {
  const [terms, setTerms] = useState(null);
  const [sources, setSources] = useState([]);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [matching, setMatching] = useState(false);
  const [message, setMessage] = useState('');
  const [imageSearchTerm, setImageSearchTerm] = useState(null);

  useEffect(() => {
    loadData();
  }, [sectionId, courseId]);

  function loadData() {
    getTerms(sectionId).then(setTerms).catch(console.error);
    getCourseImages(courseId).then(imgs => {
      // Group by source_url
      const bySource = {};
      for (const img of imgs) {
        const key = img.source_url || 'manual';
        if (!bySource[key]) bySource[key] = { url: key, count: 0, created: img.created_at };
        bySource[key].count++;
      }
      setSources(Object.values(bySource));
    }).catch(console.error);
  }

  function showMsg(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 5000);
  }

  async function handleFetchUrl(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setFetching(true);
    setMessage('');
    try {
      const result = await fetchImageSource(url.trim(), courseId);
      showMsg(`Found ${result.count} new images (${result.skipped || 0} already saved)`);
      setUrl('');
      setShowAddUrl(false);
      loadData();
    } catch (err) {
      showMsg('Error: ' + err.message);
    }
    setFetching(false);
  }

  async function handleMatch() {
    setMatching(true);
    setMessage('');
    try {
      const result = await matchDiagramsToTerms(courseId, sectionId);
      showMsg(`Matched ${result.matched} of ${result.total} terms. ${result.unmatched} still need diagrams.`);
      loadData();
    } catch (err) {
      showMsg('Error: ' + err.message);
    }
    setMatching(false);
  }

  async function handleDeleteSource(sourceUrl) {
    if (!confirm('Remove all images from this source?')) return;
    await deleteCourseImages(courseId, sourceUrl);
    loadData();
  }

  if (terms === null) {
    return (
      <div>
        {[1, 2, 3].map(i => <div key={i} className="skeleton skeleton-card" style={{ marginBottom: '8px' }} />)}
      </div>
    );
  }

  const withImage = terms.filter(t => t.image_url && t.image_url !== '');
  const withoutImage = terms.filter(t => !t.image_url || t.image_url === '');

  return (
    <div>
      {/* Image Sources Section */}
      <div className="diagram-sources mb-6">
        <div className="flex-between mb-3">
          <h3 className="text-sm" style={{ fontWeight: 600 }}>Image Sources</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddUrl(!showAddUrl)}>
            + Add Source
          </button>
        </div>

        {showAddUrl && (
          <form className="diagram-add-url mb-3" onSubmit={handleFetchUrl}>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste URL (e.g., OpenStax chapter page)..."
              required
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={fetching}>
              {fetching ? 'Scanning...' : 'Scan for Images'}
            </button>
            <button className="btn" type="button" onClick={() => setShowAddUrl(false)}>Cancel</button>
          </form>
        )}

        {sources.length > 0 ? (
          <div className="diagram-source-list">
            {sources.map((s, i) => (
              <div key={i} className="diagram-source-item">
                <div>
                  <div className="text-sm" style={{ fontWeight: 500 }}>
                    {s.url.length > 60 ? s.url.slice(0, 60) + '...' : s.url}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{s.count} images</div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteSource(s.url)}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No image sources added yet. Add a URL to an online textbook to scan for diagrams.
          </p>
        )}
      </div>

      {/* Match Button */}
      {sources.length > 0 && withoutImage.length > 0 && (
        <div className="mb-4">
          <button className="btn btn-primary" onClick={handleMatch} disabled={matching}>
            {matching ? 'Matching...' : `Match Diagrams to Terms (${withoutImage.length} need images)`}
          </button>
        </div>
      )}

      {message && <div className="autofill-done mb-4">{message}</div>}

      {/* Status Summary */}
      <div className="diagram-status mb-4">
        <span className="diagram-status-found">{withImage.length} with diagrams</span>
        <span className="stat-sep">&middot;</span>
        <span className="diagram-status-missing">{withoutImage.length} need diagrams</span>
      </div>

      {/* Terms Grid */}
      <div className="diagram-grid">
        {terms.map(t => (
          <div key={t.id} className={`diagram-card ${t.image_url ? 'has-image' : 'no-image'}`}>
            {t.image_url ? (
              <div className="diagram-card-image">
                <img src={t.image_url} alt={t.term} />
              </div>
            ) : (
              <div className="diagram-card-placeholder" onClick={() => setImageSearchTerm(t)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M3 16l5-5 4 4 3-3 6 6"/>
                </svg>
                <span>Find diagram</span>
              </div>
            )}
            <div className="diagram-card-label">
              <span className={`diagram-card-status ${t.image_url ? 'found' : 'missing'}`}>
                {t.image_url ? '✓' : '✗'}
              </span>
              {t.term}
            </div>
          </div>
        ))}
      </div>

      {imageSearchTerm && (
        <ImageSearch
          term={imageSearchTerm}
          onSelected={() => { setImageSearchTerm(null); loadData(); }}
          onClose={() => setImageSearchTerm(null)}
        />
      )}
    </div>
  );
}

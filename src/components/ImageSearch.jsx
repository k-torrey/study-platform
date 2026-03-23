import React, { useState, useEffect } from 'react';
import { searchImages, setTermImageFromUrl } from '../api';
import Modal from './Modal';

export default function ImageSearch({ term, onSelected, onClose }) {
  const [query, setQuery] = useState(term.term);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    doSearch(term.term);
  }, [term.term]);

  async function doSearch(q) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const images = await searchImages(q.trim());
      setResults(images);
    } catch (err) {
      console.error('Image search error:', err);
      setResults([]);
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') doSearch(query);
  }

  async function handleSelect(imageUrl) {
    setSaving(imageUrl);
    try {
      await setTermImageFromUrl(term.id, imageUrl);
      onSelected();
    } catch (err) {
      alert('Failed to set image: ' + err.message);
    }
    setSaving(null);
  }

  return (
    <Modal title={`Find image for "${term.term}"`} onClose={onClose}>
      <div className="image-search">
        <div className="image-search-bar">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for images..."
            autoFocus
          />
          <button className="btn btn-primary" onClick={() => doSearch(query)} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <p className="image-search-hint">
          Images from Wikimedia Commons (free to use)
        </p>

        {loading && results.length === 0 && (
          <p className="empty-msg">Searching...</p>
        )}

        {!loading && results.length === 0 && (
          <p className="empty-msg">No images found. Try different search terms.</p>
        )}

        <div className="image-search-grid">
          {results.map((img, i) => (
            <button
              key={i}
              className="image-search-item"
              onClick={() => handleSelect(img.thumb)}
              disabled={saving !== null}
              title={img.title}
            >
              <img src={img.thumb} alt={img.title} />
              {saving === img.thumb && <div className="image-search-saving">Saving...</div>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

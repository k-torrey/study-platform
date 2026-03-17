import React, { useState, useEffect, useRef } from 'react';
import { getTextbooks, searchTextbook, getSectionLinks, createSectionLink, deleteSectionLink } from '../api';

function SafeSnippet({ html }) {
  const safe = (html || '').replace(/<(?!\/?mark\b)[^>]*>/gi, '');
  return <p dangerouslySetInnerHTML={{ __html: safe }} />;
}

export default function TextbookTab({ sectionId, courseId, initialQuery, onQueryConsumed }) {
  const [textbooks, setTextbooks] = useState([]);
  const [selectedTb, setSelectedTb] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [links, setLinks] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);
  const initialQueryHandled = useRef(false);

  useEffect(() => {
    getTextbooks(courseId).then(tbs => {
      setTextbooks(tbs);
      if (tbs.length > 0) setSelectedTb(tbs[0].id);
    }).catch(console.error);
    loadLinks();
  }, [courseId, sectionId]);

  // Handle "Find in textbook" from TermsTab
  useEffect(() => {
    if (initialQuery && selectedTb && !initialQueryHandled.current) {
      initialQueryHandled.current = true;
      handleSearch(initialQuery);
      if (onQueryConsumed) onQueryConsumed();
    }
  }, [initialQuery, selectedTb]);

  function loadLinks() {
    getSectionLinks(sectionId).then(setLinks).catch(console.error);
  }

  function handleSearch(q) {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim() || !selectedTb) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchTextbook(selectedTb, q.trim());
        setResults(res);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);
  }

  async function handleLink(chapterId, excerpt) {
    await createSectionLink(sectionId, {
      textbook_chapter_id: chapterId,
      excerpt: excerpt || '',
    });
    loadLinks();
  }

  async function handleUnlink(id) {
    await deleteSectionLink(id);
    loadLinks();
  }

  return (
    <div className="textbook-tab">
      {links.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Linked Passages</h3>
          <div className="linked-passages">
            {links.map(l => (
              <div key={l.id} className="linked-passage">
                <h4>{l.textbook_title} — {l.chapter_title}</h4>
                {l.excerpt && <p>{l.excerpt}</p>}
                <div className="linked-passage-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleUnlink(l.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {textbooks.length > 0 ? (
        <>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Search Textbooks</h3>
          {textbooks.length > 1 && (
            <div className="form-group">
              <select value={selectedTb || ''} onChange={e => { setSelectedTb(Number(e.target.value)); setResults([]); setQuery(''); }}>
                {textbooks.map(tb => (
                  <option key={tb.id} value={tb.id}>{tb.title}</option>
                ))}
              </select>
            </div>
          )}
          <div className="search-input-wrapper">
            <span className="search-icon">&#x1F50D;</span>
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search textbook content..."
            />
          </div>

          {searching && <p className="empty-msg" style={{ padding: '8px' }}>Searching...</p>}

          {results.length > 0 && (
            <div className="search-results">
              {results.map(r => (
                <div key={r.id} className="search-result-item">
                  <h4>Ch. {r.chapter_number}: {r.title}</h4>
                  <SafeSnippet html={r.snippet || ''} />
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: '8px' }}
                    onClick={() => handleLink(r.id, (r.snippet || '').replace(/<[^>]+>/g, ''))}
                  >
                    Link to Section
                  </button>
                </div>
              ))}
            </div>
          )}

          {query && !searching && results.length === 0 && (
            <p className="empty-msg">No results found.</p>
          )}
        </>
      ) : (
        <div className="empty-state">
          <h2>No textbooks available</h2>
          <p>Upload a textbook from the course page to enable search.</p>
        </div>
      )}
    </div>
  );
}

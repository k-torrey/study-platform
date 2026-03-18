import React, { useState, useEffect, useRef } from 'react';
import { getTextbooks, searchTextbook, getChapterContent, getSectionLinks, createSectionLink, deleteSectionLink } from '../api';

function SafeSnippet({ html }) {
  const safe = (html || '').replace(/<(?!\/?mark\b)[^>]*>/gi, '');
  return <span dangerouslySetInnerHTML={{ __html: safe }} />;
}

function highlightTerm(text, term) {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
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

  // Reader panel state
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerChapter, setReaderChapter] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerSearchTerm, setReaderSearchTerm] = useState('');
  const readerContentRef = useRef(null);

  useEffect(() => {
    getTextbooks(courseId).then(tbs => {
      setTextbooks(tbs);
      if (tbs.length > 0) setSelectedTb(tbs[0].id);
    }).catch(console.error);
    loadLinks();
  }, [courseId, sectionId]);

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

  async function openReader(chapterId, searchTerm) {
    setReaderLoading(true);
    setReaderOpen(true);
    setReaderSearchTerm(searchTerm || query || '');
    try {
      const chapter = await getChapterContent(chapterId);
      setReaderChapter(chapter);

      // Scroll to the first occurrence of the search term after render
      setTimeout(() => {
        if (readerContentRef.current) {
          const mark = readerContentRef.current.querySelector('mark');
          if (mark) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
    } catch {
      setReaderChapter(null);
    }
    setReaderLoading(false);
  }

  function closeReader() {
    setReaderOpen(false);
    setReaderChapter(null);
    setReaderSearchTerm('');
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

  // Split content into paragraphs for readable display
  function renderChapterContent(content, searchTerm) {
    const paragraphs = content.split(/\n{2,}|\.\s{2,}/);
    const html = paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => {
        const safe = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return searchTerm ? highlightTerm(safe, searchTerm) : safe;
      })
      .map(p => `<p>${p}</p>`)
      .join('');
    return html;
  }

  return (
    <div className={`textbook-tab ${readerOpen ? 'textbook-tab-with-reader' : ''}`}>
      <div className="textbook-main">
        {/* Linked passages */}
        {links.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Linked Passages</h3>
            <div className="linked-passages">
              {links.map(l => (
                <div key={l.id} className="linked-passage">
                  <h4>{l.textbook_title} — {l.chapter_title}</h4>
                  {l.excerpt && <p>{l.excerpt}</p>}
                  <div className="linked-passage-actions">
                    <button className="btn btn-sm" onClick={() => openReader(l.textbook_chapter_id)}>Read More</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleUnlink(l.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
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
                  <div key={r.id} className="search-result-item" onClick={() => openReader(r.id, query)} style={{ cursor: 'pointer' }}>
                    <h4>Ch. {r.chapter_number}: {r.title}</h4>
                    <p><SafeSnippet html={r.snippet || ''} /></p>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button
                        className="btn btn-sm"
                        onClick={(e) => { e.stopPropagation(); openReader(r.id, query); }}
                      >
                        Read More
                      </button>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => { e.stopPropagation(); handleLink(r.id, (r.snippet || '').replace(/<[^>]+>/g, '')); }}
                      >
                        Link to Section
                      </button>
                    </div>
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

      {/* Reader side panel */}
      {readerOpen && (
        <div className="reader-panel">
          <div className="reader-header">
            <div className="reader-title">
              {readerChapter
                ? `Ch. ${readerChapter.chapter_number}: ${readerChapter.title}`
                : 'Loading...'
              }
            </div>
            <button className="btn btn-sm btn-ghost" onClick={closeReader}>Close</button>
          </div>
          <div className="reader-content" ref={readerContentRef}>
            {readerLoading && <p className="empty-msg">Loading chapter...</p>}
            {!readerLoading && readerChapter && (
              <div
                className="reader-text"
                dangerouslySetInnerHTML={{
                  __html: renderChapterContent(readerChapter.content, readerSearchTerm)
                }}
              />
            )}
            {!readerLoading && !readerChapter && (
              <p className="empty-msg">Failed to load chapter content.</p>
            )}
          </div>
          {readerChapter && (
            <div className="reader-footer">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => handleLink(readerChapter.id, '')}
              >
                Link This Chapter to Section
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

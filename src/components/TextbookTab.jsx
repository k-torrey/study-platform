import React, { useState, useEffect, useRef } from 'react';
import { getTextbooks, searchTextbook, semanticSearchTextbook, getChapterContent, getSectionLinks, createSectionLink, deleteSectionLink, updateTerm } from '../api';

function SafeSnippet({ html }) {
  const safe = (html || '').replace(/<(?!\/?mark\b)[^>]*>/gi, '');
  return <span dangerouslySetInnerHTML={{ __html: safe }} />;
}

function highlightTerm(text, term) {
  if (!term) return text;

  // Build a pattern that matches the full phrase OR any individual word (3+ chars)
  const words = term.split(/\s+/).filter(w => w.length >= 3);
  const fullEscaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordPatterns = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Full phrase first, then individual words — longest match wins
  const allPatterns = [fullEscaped, ...wordPatterns.filter(w => w !== fullEscaped)];
  const combined = allPatterns.join('|');

  const regex = new RegExp(`(${combined})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

export default function TextbookTab({ sectionId, courseId, initialQuery, onQueryConsumed, activeTerm, onDefinitionSet }) {
  const [textbooks, setTextbooks] = useState([]);
  const [selectedTb, setSelectedTb] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [links, setLinks] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);
  const initialQueryHandled = useRef(false);

  const [readerOpen, setReaderOpen] = useState(false);
  const [readerChapter, setReaderChapter] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerSearchTerm, setReaderSearchTerm] = useState('');
  const readerContentRef = useRef(null);

  const [successMsg, setSuccessMsg] = useState('');
  const [linkedChapterIds, setLinkedChapterIds] = useState(new Set());

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
    getSectionLinks(sectionId).then(data => {
      setLinks(data);
      setLinkedChapterIds(new Set(data.map(l => l.textbook_chapter_id)));
    }).catch(console.error);
  }

  function handleSearch(q) {
    setQuery(q);
    setSuccessMsg('');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim() || !selectedTb) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        // Try semantic search first, fall back to FTS
        const semanticResults = await semanticSearchTextbook(selectedTb, q.trim());
        if (semanticResults && semanticResults.length > 0) {
          setResults(semanticResults);
        } else {
          const ftsResults = await searchTextbook(selectedTb, q.trim());
          setResults(ftsResults);
        }
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
      // Scroll to first highlight after render
      const scrollToMark = () => {
        if (readerContentRef.current) {
          const mark = readerContentRef.current.querySelector('mark');
          if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
      setTimeout(scrollToMark, 150);
      setTimeout(scrollToMark, 500); // retry in case content was still rendering
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

  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  async function handleLink(chapterId, excerpt) {
    if (linkedChapterIds.has(chapterId)) {
      showSuccess('This chapter is already linked to this section.');
      return;
    }
    await createSectionLink(sectionId, {
      textbook_chapter_id: chapterId,
      excerpt: excerpt || '',
    });
    loadLinks();
    showSuccess('Linked to section!');
  }

  async function handleUnlink(id) {
    await deleteSectionLink(id);
    loadLinks();
  }

  async function handleUseAsDefinition(snippetHtml) {
    if (!activeTerm) return;
    const plainText = (snippetHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!plainText) return;
    await updateTerm(activeTerm.id, {
      term: activeTerm.term,
      definition: plainText,
    });
    showSuccess(`Definition set for "${activeTerm.term}"`);
    if (onDefinitionSet) onDefinitionSet();
  }

  function renderChapterContent(content, searchTerm) {
    const paragraphs = content.split(/\n{2,}|\.\s{2,}/);
    return paragraphs
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => {
        const safe = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return searchTerm ? highlightTerm(safe, searchTerm) : safe;
      })
      .map(p => `<p>${p}</p>`)
      .join('');
  }

  const isAlreadyLinked = (chapterId) => linkedChapterIds.has(chapterId);

  return (
    <div className={`textbook-tab ${readerOpen ? 'textbook-tab-with-reader' : ''}`}>
      <div className="textbook-main">
        {activeTerm && (
          <div className="textbook-term-banner">
            Finding definition for: <strong>{activeTerm.term}</strong>
            <button className="btn btn-sm btn-ghost" onClick={() => { if (onDefinitionSet) onDefinitionSet(); }}>Cancel</button>
          </div>
        )}

        {successMsg && (
          <div className="textbook-success">{successMsg}</div>
        )}

        {links.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm mb-3" style={{ fontWeight: 600 }}>Linked Passages</h3>
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

        {textbooks.length > 0 ? (
          <>
            <h3 className="text-sm mb-3" style={{ fontWeight: 600 }}>Search Textbooks</h3>
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

            {searching && <p className="empty-msg">Searching...</p>}

            {results.length > 0 && (
              <div className="search-results">
                {results.map(r => {
                  const linked = isAlreadyLinked(r.id);
                  return (
                    <div key={r.id} className={`search-result-item ${linked ? 'search-result-linked' : ''}`} onClick={() => openReader(r.id, query)}>
                      <div className="flex-between">
                        <h4>Ch. {r.chapter_number}: {r.title}</h4>
                        {linked && <span className="linked-badge">Linked</span>}
                      </div>
                      <p><SafeSnippet html={r.snippet || ''} /></p>
                      <div className="flex-row-wrap mt-2">
                        {activeTerm && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={(e) => { e.stopPropagation(); handleUseAsDefinition(r.snippet); }}
                          >
                            Use as Definition
                          </button>
                        )}
                        <button
                          className="btn btn-sm"
                          onClick={(e) => { e.stopPropagation(); openReader(r.id, query); }}
                        >
                          Read More
                        </button>
                        <button
                          className={`btn btn-sm ${linked ? '' : 'btn-primary'}`}
                          onClick={(e) => { e.stopPropagation(); handleLink(r.id, (r.snippet || '').replace(/<[^>]+>/g, '')); }}
                          disabled={linked}
                        >
                          {linked ? 'Already Linked' : 'Link to Section'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {query && !searching && results.length === 0 && (
              <p className="empty-msg">No results found.</p>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <h2>No textbooks available</h2>
            <p>Upload a textbook from the course page to enable search.</p>
          </div>
        )}
      </div>

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
              <div className="flex-row-wrap">
                {activeTerm && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const sel = window.getSelection();
                      if (sel && sel.toString().trim()) {
                        handleUseAsDefinition(sel.toString());
                      } else {
                        alert('Select (highlight) the text you want to use as the definition, then click this button.');
                      }
                    }}
                  >
                    Use Selected Text as Definition
                  </button>
                )}
                <button
                  className={`btn btn-sm ${isAlreadyLinked(readerChapter.id) ? '' : 'btn-primary'}`}
                  onClick={() => handleLink(readerChapter.id, '')}
                  disabled={isAlreadyLinked(readerChapter.id)}
                >
                  {isAlreadyLinked(readerChapter.id) ? 'Already Linked' : 'Link Chapter to Section'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

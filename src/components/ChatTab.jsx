import React, { useState, useRef, useEffect } from 'react';
import { askChatbot, getChapterContent } from '../api';

const STOP_WORDS = new Set([
  'what','where','which','when','how','why','who','whom','does','doing',
  'the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','did','will','would','shall','should',
  'may','might','must','can','could','about','above','after','again',
  'all','also','and','any','because','before','between','both','but',
  'by','for','from','get','got','if','in','into','its','just',
  'more','most','not','of','on','or','other','out','over','own',
  'same','so','some','such','than','that','their','them','then',
  'there','these','they','this','those','through','to','too','under',
  'up','very','with','you','your','me','my','our','we','us',
  'tell','explain','describe','define','list','name','give','make',
  'know','think','mean','called','many','much','like','does',
]);

function extractKeyTerms(question) {
  return question
    .replace(/[?.,!'"]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()));
}

function highlightTerms(text, question) {
  if (!question) return text;
  const keywords = extractKeyTerms(question);
  if (keywords.length === 0) return text;

  // Try full multi-word phrase first, then individual keywords
  const fullPhrase = keywords.join(' ');
  const escapedPhrase = fullPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedWords = keywords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const patterns = [escapedPhrase, ...escapedWords].filter(Boolean);
  const combined = patterns.join('|');

  return text.replace(new RegExp(`(${combined})`, 'gi'), '<mark>$1</mark>');
}

function renderChapterWithPassage(content, passage) {
  if (!passage) {
    // No passage — just render plain chapter
    const paragraphs = content.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
    return paragraphs.map(p => {
      const safe = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p>${safe}</p>`;
    }).join('');
  }

  // Find the passage location in the chapter by searching for a unique substring
  const normalized = content.replace(/\s+/g, ' ');
  const passageNorm = passage.replace(/\s+/g, ' ').trim();

  // Try progressively shorter substrings from the passage until we find a match
  let matchStart = -1;
  let matchLen = 0;
  const attempts = [
    passageNorm.slice(0, 200),
    passageNorm.slice(0, 120),
    passageNorm.slice(0, 80),
    passageNorm.slice(50, 150),
    passageNorm.slice(0, 50),
  ];

  for (const attempt of attempts) {
    if (attempt.length < 20) continue;
    const idx = normalized.indexOf(attempt);
    if (idx >= 0) {
      matchStart = idx;
      // Extend to cover as much of the passage as we can find
      matchLen = Math.min(passageNorm.length, normalized.length - idx);
      // Verify the extended match
      const extended = normalized.slice(idx, idx + matchLen);
      if (extended.slice(0, attempt.length) === attempt) {
        break;
      }
    }
  }

  if (matchStart < 0) {
    // Couldn't find passage — render plain
    const paragraphs = content.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
    return paragraphs.map(p => {
      const safe = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<p>${safe}</p>`;
    }).join('');
  }

  // Split chapter into: before, highlighted passage, after
  const before = normalized.slice(0, matchStart);
  const highlighted = normalized.slice(matchStart, matchStart + matchLen);
  const after = normalized.slice(matchStart + matchLen);

  function renderSection(text) {
    return text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0)
      .map(p => `<p>${p.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
  }

  return renderSection(before)
    + `<div class="passage-highlight" id="passage-anchor">${renderSection(highlighted)}</div>`
    + renderSection(after);
}

function MessageContent({ text, onCiteClick }) {
  // Simple markdown + clickable citation links
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^Sources?:(.+)$/gm, '') // Remove trailing source lines (inline citations replace them)
    .replace(/\n/g, '<br/>');

  // Replace [1], [2], etc. with clickable citation badges
  html = html.replace(/\[(\d+)\]/g, '<button class="cite-link" data-cite="$1">[$1]</button>');

  function handleClick(e) {
    const cite = e.target.dataset?.cite;
    if (cite && onCiteClick) {
      onCiteClick(parseInt(cite, 10));
    }
  }

  return (
    <div
      className="chat-message-text"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  );
}

export default function ChatTab({ courseId }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I\'m your study assistant. Ask me anything about your textbook and I\'ll find the answer for you.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sourcesMap, setSourcesMap] = useState({}); // msgIndex → sources[]
  const messagesEndRef = useRef(null);

  // Reader panel state
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerChapter, setReaderChapter] = useState(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerSearchTerm, setReaderSearchTerm] = useState('');
  const readerContentRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    const userMsg = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Build history for context (exclude system greeting)
      const history = messages
        .filter((m, i) => i > 0) // skip greeting
        .map(m => ({ role: m.role, content: m.content }));

      const { answer, sources } = await askChatbot(question, courseId, history);

      const msgIndex = messages.length + 1; // index of the assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);

      if (sources?.length) {
        setSourcesMap(prev => ({ ...prev, [msgIndex]: sources }));
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I ran into an error processing your question. Please try again.',
      }]);
    }

    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const [readerPassage, setReaderPassage] = useState('');

  async function openReader(chapterId, searchTerm, passage) {
    setReaderLoading(true);
    setReaderOpen(true);
    setReaderPassage(passage || '');
    setReaderSearchTerm(searchTerm || '');
    try {
      const chapter = await getChapterContent(chapterId);
      setReaderChapter(chapter);
      const scrollToHighlight = () => {
        if (readerContentRef.current) {
          const anchor = readerContentRef.current.querySelector('#passage-anchor');
          if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }
      };
      setTimeout(scrollToHighlight, 200);
      setTimeout(scrollToHighlight, 600);
    } catch {
      setReaderChapter(null);
    }
    setReaderLoading(false);
  }

  // Extract the question from the user message before this assistant message
  function getQuestionForMsg(msgIndex) {
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') return messages[i].content;
    }
    return '';
  }

  return (
    <div className={`chat-tab ${readerOpen ? 'chat-tab-with-reader' : ''}`}>
      <div className="chat-main">
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message chat-message-${msg.role}`}>
              <div className="chat-message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="chat-message-body">
                <MessageContent
                  text={msg.content}
                  onCiteClick={(num) => {
                    const srcs = sourcesMap[i];
                    if (srcs && srcs[num - 1]) {
                      const src = srcs[num - 1];
                      openReader(src.chapter_id, getQuestionForMsg(i), src.passage);
                    }
                  }}
                />
                {sourcesMap[i] && (
                  <div className="chat-source-links">
                    {sourcesMap[i].map((s, j) => (
                      <button
                        key={j}
                        className="btn btn-sm chat-source-btn"
                        onClick={() => openReader(s.chapter_id, getQuestionForMsg(i), s.passage)}
                      >
                        [{j + 1}] Ch. {s.chapter_number}: {s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-message-avatar">🤖</div>
              <div className="chat-message-body">
                <div className="chat-typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your textbook..."
            rows={1}
            disabled={loading}
          />
          <button
            className="btn btn-primary chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            Send
          </button>
        </div>
      </div>

      {readerOpen && (
        <div className="reader-panel">
          <div className="reader-header">
            <div className="reader-title">
              {readerChapter
                ? `Ch. ${readerChapter.chapter_number}: ${readerChapter.title}`
                : 'Loading...'}
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => { setReaderOpen(false); setReaderChapter(null); }}>Close</button>
          </div>
          <div className="reader-content" ref={readerContentRef}>
            {readerLoading && <p className="empty-msg">Loading chapter...</p>}
            {!readerLoading && readerChapter && (
              <div
                className="reader-text"
                dangerouslySetInnerHTML={{
                  __html: renderChapterWithPassage(readerChapter.content, readerPassage)
                }}
              />
            )}
            {!readerLoading && !readerChapter && (
              <p className="empty-msg">Failed to load chapter content.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

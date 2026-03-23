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

function renderChapterContent(content, searchTerms) {
  const paragraphs = content.split(/\n{2,}|\.\s{2,}/);
  return paragraphs
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      const safe = p.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return searchTerms ? highlightTerms(safe, searchTerms) : safe;
    })
    .map(p => `<p>${p}</p>`)
    .join('');
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

  // Extract a unique phrase from a passage to use as highlight anchor
  function getAnchorPhrase(passage) {
    if (!passage) return '';
    // Split into sentences, find one that's 40-150 chars (distinctive enough)
    const sentences = passage.split(/(?<=[.!])\s+/).filter(s => s.length > 30 && s.length < 200);
    if (sentences.length > 0) {
      // Pick the first substantial sentence — extract 6-10 words from the middle
      const sent = sentences[0];
      const words = sent.split(/\s+/);
      const start = Math.max(0, Math.floor(words.length * 0.2));
      const phrase = words.slice(start, start + 8).join(' ');
      return phrase;
    }
    // Fallback: take a chunk from the middle of the passage
    const mid = Math.floor(passage.length * 0.3);
    return passage.slice(mid, mid + 60).trim();
  }

  async function openReader(chapterId, searchTerm, passage) {
    setReaderLoading(true);
    setReaderOpen(true);
    // Use a distinctive phrase from the passage to anchor the highlight
    const anchor = passage ? getAnchorPhrase(passage) : searchTerm;
    setReaderSearchTerm(anchor || searchTerm || '');
    try {
      const chapter = await getChapterContent(chapterId);
      setReaderChapter(chapter);
      setTimeout(() => {
        if (readerContentRef.current) {
          const mark = readerContentRef.current.querySelector('mark');
          if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
      setTimeout(() => {
        if (readerContentRef.current) {
          const mark = readerContentRef.current.querySelector('mark');
          if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 600);
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
                  __html: renderChapterContent(readerChapter.content, readerSearchTerm)
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

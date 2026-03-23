import React, { useState, useRef, useEffect } from 'react';
import { askChatbot, getChapterContent } from '../api';

function highlightTerms(text, terms) {
  if (!terms || terms.length === 0) return text;
  const words = terms.split(/\s+/).filter(w => w.length >= 3);
  const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return text;
  return text.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
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

function MessageContent({ text }) {
  // Simple markdown: **bold**, *italic*, newlines, and source lines
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^Sources?:(.+)$/gm, '<div class="chat-sources-line">Sources:$1</div>')
    .replace(/\n/g, '<br/>');

  return <div className="chat-message-text" dangerouslySetInnerHTML={{ __html: html }} />;
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

  async function openReader(chapterId, searchTerm) {
    setReaderLoading(true);
    setReaderOpen(true);
    setReaderSearchTerm(searchTerm || '');
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
                <MessageContent text={msg.content} />
                {sourcesMap[i] && (
                  <div className="chat-source-links">
                    {sourcesMap[i].map((s, j) => (
                      <button
                        key={j}
                        className="btn btn-sm chat-source-btn"
                        onClick={() => openReader(s.chapter_id, getQuestionForMsg(i))}
                      >
                        Ch. {s.chapter_number}: {s.title}
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

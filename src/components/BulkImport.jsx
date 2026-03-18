import React, { useState } from 'react';
import { bulkImportTerms } from '../api';

const DELIMITERS = [
  { key: 'auto', label: 'Auto-detect' },
  { key: 'tab', label: 'Tab' },
  { key: 'dash', label: 'Dash ( - )' },
  { key: 'colon', label: 'Colon ( : )' },
];

function parseLine(line, delimiter) {
  line = line.replace(/^\d+[.)]\s*/, '');

  if (delimiter === 'tab') {
    const idx = line.indexOf('\t');
    return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] : null;
  }
  if (delimiter === 'dash') {
    const idx = line.indexOf(' - ');
    return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 3).trim()] : null;
  }
  if (delimiter === 'colon') {
    const idx = line.indexOf(': ');
    if (idx < 0) {
      const idx2 = line.indexOf(':');
      return idx2 > 0 ? [line.slice(0, idx2).trim(), line.slice(idx2 + 1).trim()] : null;
    }
    return [line.slice(0, idx).trim(), line.slice(idx + 2).trim()];
  }
  return null;
}

function detectDelimiter(lines) {
  const scores = { tab: 0, dash: 0, colon: 0 };
  for (const line of lines.slice(0, 10)) {
    if (line.includes('\t')) scores.tab++;
    if (line.includes(' - ')) scores.dash++;
    if (line.includes(': ') || line.includes(':')) scores.colon++;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'tab';
}

function parseAll(text, delimiterKey) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const delimiter = delimiterKey === 'auto' ? detectDelimiter(lines) : delimiterKey;

  const results = [];
  for (const line of lines) {
    const parsed = parseLine(line, delimiter);
    if (parsed && parsed[0] && parsed[1]) {
      results.push({ term: parsed[0], definition: parsed[1] });
    }
  }
  return { results, detectedDelimiter: delimiter };
}

async function extractTextFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  // Plain text / CSV
  if (['txt', 'csv', 'tsv'].includes(ext)) {
    return await file.text();
  }

  // Word documents (.docx)
  if (['docx'].includes(ext)) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // PDF — send to serverless function
  if (ext === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const res = await fetch('/api/terms/extract-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName: file.name }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to process PDF' }));
      throw new Error(err.error);
    }

    const data = await res.json();
    return data.text;
  }

  throw new Error(`Unsupported file type: .${ext}. Supported: .txt, .csv, .tsv, .docx, .pdf`);
}

export default function BulkImport({ sectionId, onImported }) {
  const [text, setText] = useState('');
  const [delimiter, setDelimiter] = useState('auto');
  const [preview, setPreview] = useState(null);
  const [detectedDel, setDetectedDel] = useState(null);
  const [importing, setImporting] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  function handlePreview() {
    const { results, detectedDelimiter } = parseAll(text, delimiter);
    setPreview(results);
    setDetectedDel(detectedDelimiter);
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setFileLoading(true);
    setPreview(null);
    try {
      const extracted = await extractTextFromFile(file);
      setText(extracted);
    } catch (err) {
      alert(err.message);
    } finally {
      setFileLoading(false);
      e.target.value = '';
    }
  }

  async function handleImport() {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      await bulkImportTerms({ section_id: sectionId, terms: preview });
      setText('');
      setPreview(null);
      onImported();
    } catch (err) {
      alert('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bulk-import">
      <h2>Bulk Import Terms</h2>
      <p className="help-text">
        Upload a file or paste your term list below. Each line should have a term and definition
        separated by a tab, dash, or colon. Supported files: PDF, Word (.docx), TXT, CSV.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <label className="btn" style={{ cursor: 'pointer' }}>
          {fileLoading ? 'Reading file...' : 'Upload File'}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.csv,.tsv"
            onChange={handleFileUpload}
            hidden
            disabled={fileLoading}
          />
        </label>
        <div className="import-controls" style={{ marginBottom: 0 }}>
          <label>
            Delimiter:
            <select value={delimiter} onChange={e => { setDelimiter(e.target.value); setPreview(null); }}>
              {DELIMITERS.map(d => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <textarea
        className="import-textarea"
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null); }}
        placeholder={`Paste terms here, or upload a file above.\n\nSupported formats:\nHumerus\tUpper arm bone\nFemur - Thigh bone\nTibia: Shin bone`}
        rows={10}
      />

      <div className="import-actions">
        <button className="btn btn-primary" onClick={handlePreview} disabled={!text.trim()}>
          Preview
        </button>
        {preview && preview.length > 0 && (
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing...' : `Import ${preview.length} terms`}
          </button>
        )}
      </div>

      {preview && (
        <div className="import-preview">
          <h3>
            Preview ({preview.length} terms)
            {detectedDel && delimiter === 'auto' && (
              <span className="detected-del"> — detected: {detectedDel}</span>
            )}
          </h3>
          {preview.length === 0 ? (
            <p className="empty-msg">No terms could be parsed. Try a different delimiter.</p>
          ) : (
            <table className="preview-table">
              <thead>
                <tr><th>Term</th><th>Definition</th></tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td>{p.term}</td>
                    <td>{p.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

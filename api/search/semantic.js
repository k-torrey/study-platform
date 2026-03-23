import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: semantic search using Gemini embeddings + pgvector
// Embeds the query, then finds most similar textbook chunks

async function embedQuery(text, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

function extractSnippet(content, query, maxWords = 35) {
  // Find the most relevant portion of the chunk around the query terms
  const words = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();

  let bestPos = 0;
  let bestScore = 0;

  // Slide a window and score by query term matches
  const contentWords = content.split(/\s+/);
  for (let i = 0; i < contentWords.length - 10; i++) {
    const window = contentWords.slice(i, i + maxWords).join(' ').toLowerCase();
    const score = words.filter(w => window.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestPos = i;
    }
  }

  const snippetWords = contentWords.slice(bestPos, bestPos + maxWords);
  let snippet = snippetWords.join(' ');

  // Highlight query terms with <mark> tags
  for (const word of words) {
    if (word.length < 3) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    snippet = snippet.replace(regex, '<mark>$1</mark>');
  }

  return snippet;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, textbookId, courseId, limit } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!textbookId && !courseId) {
    return res.status(400).json({ error: 'textbookId or courseId is required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceKey || !geminiKey) {
    return res.status(200).json({ results: [], fallback: true });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Embed the query
    const queryEmbedding = await embedQuery(query, geminiKey);
    const matchCount = limit || 10;

    let results;
    if (textbookId) {
      const { data, error } = await supabase.rpc('semantic_search_chunks', {
        query_embedding: JSON.stringify(queryEmbedding),
        p_textbook_id: textbookId,
        match_count: matchCount,
      });
      if (error) throw new Error(error.message);
      results = data;
    } else {
      const { data, error } = await supabase.rpc('semantic_search_course', {
        query_embedding: JSON.stringify(queryEmbedding),
        p_course_id: courseId,
        match_count: matchCount,
      });
      if (error) throw new Error(error.message);
      results = data;
    }

    // Format results with snippets
    const formatted = (results || []).map(r => ({
      id: r.chapter_id,
      chapter_number: r.chapter_number,
      title: r.chapter_title,
      snippet: extractSnippet(r.content, query),
      similarity: r.similarity,
      chunk_content: r.content,
    }));

    // Deduplicate by chapter (keep highest similarity per chapter)
    const byChapter = new Map();
    for (const r of formatted) {
      if (!byChapter.has(r.id) || r.similarity > byChapter.get(r.id).similarity) {
        byChapter.set(r.id, r);
      }
    }

    return res.status(200).json({
      results: Array.from(byChapter.values()).sort((a, b) => b.similarity - a.similarity),
    });
  } catch (err) {
    console.error('Semantic search error:', err);
    return res.status(200).json({ results: [], fallback: true, error: err.message });
  }
}

import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: chunk textbook chapters and generate Gemini embeddings
// Called after textbook processing to enable semantic search

const CHUNK_SIZE = 2000;    // ~500 tokens
const CHUNK_OVERLAP = 300;  // overlap between chunks
const BATCH_SIZE = 100;     // Gemini supports up to 100 per batch

function chunkText(text) {
  const chunks = [];
  // Split on paragraph boundaries
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 20);

  let current = '';
  let overlapBuffer = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (current.length + trimmed.length + 1 > CHUNK_SIZE && current.length > 200) {
      chunks.push(current.trim());
      // Keep tail as overlap for next chunk
      overlapBuffer = current.slice(-CHUNK_OVERLAP);
      current = overlapBuffer + ' ' + trimmed;
    } else {
      current += (current ? ' ' : '') + trimmed;
    }
  }

  if (current.trim().length > 50) {
    chunks.push(current.trim());
  }

  // If no paragraph splits worked, fall back to character-based chunking
  if (chunks.length === 0 && text.length > 100) {
    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunk = text.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 50) chunks.push(chunk);
    }
  }

  return chunks;
}

async function embedBatch(texts, apiKey) {
  // Gemini batchEmbedContents
  const requests = texts.map(text => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768,
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.embeddings.map(e => e.values);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!geminiKey) {
    return res.status(200).json({ chunk_count: 0, message: 'No GEMINI_API_KEY configured, skipping embeddings' });
  }

  // Verify the user's token
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { textbookId } = req.body;
  if (!textbookId) {
    return res.status(400).json({ error: 'textbookId is required' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Get all chapters for this textbook
    const { data: chapters, error: chapError } = await supabase
      .from('textbook_chapters')
      .select('id, chapter_number, title, content')
      .eq('textbook_id', textbookId)
      .order('chapter_number');

    if (chapError || !chapters?.length) {
      return res.status(200).json({ chunk_count: 0, message: 'No chapters found' });
    }

    // Delete any existing chunks for this textbook's chapters
    const chapterIds = chapters.map(c => c.id);
    await supabase.from('textbook_chunks').delete().in('chapter_id', chapterIds);

    // Chunk all chapters and prepare for embedding
    const allChunks = [];
    for (const chapter of chapters) {
      const chunks = chunkText(chapter.content);
      chunks.forEach((content, i) => {
        allChunks.push({
          chapter_id: chapter.id,
          chunk_index: i,
          content,
          // Prepend chapter context for better embedding
          textForEmbedding: `${chapter.title}\n\n${content}`,
        });
      });
    }

    if (allChunks.length === 0) {
      return res.status(200).json({ chunk_count: 0, message: 'No chunks generated' });
    }

    // Generate embeddings in batches
    let totalEmbedded = 0;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => c.textForEmbedding);

      const embeddings = await embedBatch(texts, geminiKey);

      // Insert chunks with embeddings
      const rows = batch.map((chunk, j) => ({
        chapter_id: chunk.chapter_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[j]),
      }));

      const { error: insertError } = await supabase
        .from('textbook_chunks')
        .insert(rows);

      if (insertError) {
        console.error('Chunk insert error:', insertError);
        // Continue with remaining batches
      } else {
        totalEmbedded += batch.length;
      }
    }

    return res.status(200).json({ chunk_count: totalEmbedded });
  } catch (err) {
    console.error('Embedding error:', err);
    return res.status(500).json({ error: 'Embedding generation failed: ' + err.message });
  }
}

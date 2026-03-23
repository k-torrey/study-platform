// One-time script: generate embeddings for existing textbook chapters
// Usage: node scripts/embed-textbook.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pqgfhzwtsebbbqfismmz.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TEXTBOOK_ID = 3;

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 300;
const BATCH_SIZE = 20; // Smaller batches for rate limits

if (!SERVICE_KEY || !GEMINI_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and GEMINI_API_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function chunkText(text) {
  const chunks = [];

  // Try paragraph-based splitting first
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 20);

  if (paragraphs.length > 1) {
    let current = '';
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (current.length + trimmed.length + 1 > CHUNK_SIZE && current.length > 200) {
        chunks.push(current.trim());
        current = current.slice(-CHUNK_OVERLAP) + ' ' + trimmed;
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }
    if (current.trim().length > 50) chunks.push(current.trim());
  }

  // If paragraph splitting didn't work well, use sentence-aware character chunking
  if (chunks.length <= 1) {
    chunks.length = 0; // clear
    // Split on sentence boundaries (. followed by space and capital letter, or newline)
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);

    let current = '';
    for (const sent of sentences) {
      const trimmed = sent.trim();
      if (!trimmed) continue;
      if (current.length + trimmed.length + 1 > CHUNK_SIZE && current.length > 200) {
        chunks.push(current.trim());
        current = current.slice(-CHUNK_OVERLAP) + ' ' + trimmed;
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }
    if (current.trim().length > 50) chunks.push(current.trim());
  }

  // Last resort: hard character splitting
  if (chunks.length <= 1 && text.length > CHUNK_SIZE * 2) {
    chunks.length = 0;
    for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunk = text.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 50) chunks.push(chunk);
    }
  }

  return chunks;
}

async function embedBatch(texts) {
  const requests = texts.map(text => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: text.slice(0, 8000) }] }, // Trim to token limit
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768,
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.embeddings.map(e => e.values);
}

async function main() {
  console.log('Fetching chapters...');
  const { data: chapters, error } = await supabase
    .from('textbook_chapters')
    .select('id, chapter_number, title, content')
    .eq('textbook_id', TEXTBOOK_ID)
    .order('chapter_number');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Found ${chapters.length} chapters`);

  // Clear existing chunks
  const chapterIds = chapters.map(c => c.id);
  await supabase.from('textbook_chunks').delete().in('chapter_id', chapterIds);

  // Chunk all chapters
  const allChunks = [];
  for (const ch of chapters) {
    const chunks = chunkText(ch.content);
    console.log(`  Ch ${ch.chapter_number} "${ch.title.slice(0, 40)}..." → ${chunks.length} chunks (${ch.content.length} chars)`);
    chunks.forEach((content, i) => {
      allChunks.push({
        chapter_id: ch.id,
        chunk_index: i,
        content,
        textForEmbedding: `${ch.title}\n\n${content}`,
      });
    });
  }
  console.log(`\nTotal: ${allChunks.length} chunks`);

  // Embed and insert in batches
  let inserted = 0;
  const totalBatches = Math.ceil(allChunks.length / BATCH_SIZE);

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const texts = batch.map(c => c.textForEmbedding);

    process.stdout.write(`[${batchNum}/${totalBatches}] Embedding ${batch.length} chunks...`);

    try {
      const embeddings = await embedBatch(texts);

      const rows = batch.map((chunk, j) => ({
        chapter_id: chunk.chapter_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        embedding: JSON.stringify(embeddings[j]),
      }));

      const { error: insertErr } = await supabase.from('textbook_chunks').insert(rows);
      if (insertErr) {
        console.log(` INSERT ERROR: ${insertErr.message}`);
      } else {
        inserted += batch.length;
        console.log(` ✓ (${inserted}/${allChunks.length})`);
      }
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      // Wait longer and retry
      console.log('  Waiting 30s before retry...');
      await new Promise(r => setTimeout(r, 30000));
      try {
        const embeddings = await embedBatch(texts);
        const rows = batch.map((chunk, j) => ({
          chapter_id: chunk.chapter_id,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          embedding: JSON.stringify(embeddings[j]),
        }));
        const { error: insertErr } = await supabase.from('textbook_chunks').insert(rows);
        if (!insertErr) {
          inserted += batch.length;
          console.log(`  Retry ✓ (${inserted}/${allChunks.length})`);
        }
      } catch (retryErr) {
        console.log(`  Retry failed: ${retryErr.message}`);
      }
    }

    // Delay between batches for rate limiting
    if (i + BATCH_SIZE < allChunks.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log(`\nDone! Embedded ${inserted}/${allChunks.length} chunks`);
}

main();

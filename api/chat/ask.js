import { createClient } from '@supabase/supabase-js';

// RAG chatbot: answers questions using textbook content + Claude

async function embedQuery(text, geminiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
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
  if (!res.ok) return null;
  const data = await res.json();
  return data.embedding.values;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, courseId, history } = req.body;
  if (!question || !courseId) {
    return res.status(400).json({ error: 'question and courseId required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Step 1: Find relevant textbook passages
    let passages = [];
    const sources = [];

    // Try semantic search first (Gemini embeddings + pgvector)
    if (geminiKey) {
      const embedding = await embedQuery(question, geminiKey);
      if (embedding) {
        const { data: semResults } = await supabase.rpc('semantic_search_course', {
          query_embedding: JSON.stringify(embedding),
          p_course_id: courseId,
          match_count: 5,
        });
        if (semResults?.length) {
          for (const r of semResults) {
            passages.push(r.content);
            sources.push({
              chapter_id: r.chapter_id,
              chapter_number: r.chapter_number,
              title: r.chapter_title,
              similarity: r.similarity,
            });
          }
        }
      }
    }

    // Also do FTS for keyword coverage
    const { data: textbooks } = await supabase
      .from('textbooks').select('id').eq('course_id', courseId);

    if (textbooks?.length && passages.length < 5) {
      // Extract key words from question for FTS
      const ftsQuery = question
        .replace(/[?.,!'"]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 4)
        .join(' ');

      for (const tb of textbooks) {
        const { data: ftsResults } = await supabase.rpc('search_textbook_chapters', {
          textbook_id_input: tb.id,
          query: ftsQuery,
        });
        if (ftsResults?.length) {
          for (const r of ftsResults.slice(0, 3)) {
            // Avoid duplicate chapters
            if (!sources.some(s => s.chapter_id === r.id)) {
              // Get full chunk of text around the match
              const { data: ch } = await supabase
                .from('textbook_chapters')
                .select('content')
                .eq('id', r.id)
                .single();

              if (ch?.content) {
                // Extract ~2000 chars around where the key terms appear
                const lower = ch.content.toLowerCase();
                const termPos = lower.indexOf(ftsQuery.split(' ')[0].toLowerCase());
                const start = Math.max(0, termPos - 500);
                const excerpt = ch.content.slice(start, start + 2000);
                passages.push(excerpt);
                sources.push({
                  chapter_id: r.id,
                  chapter_number: r.chapter_number,
                  title: r.title,
                  similarity: 0,
                });
              }
            }
          }
        }
      }
    }

    // Deduplicate sources
    const uniqueSources = [];
    const seenChapters = new Set();
    for (const s of sources) {
      if (!seenChapters.has(s.chapter_id)) {
        seenChapters.add(s.chapter_id);
        uniqueSources.push(s);
      }
    }

    // Step 2: Build context for Claude
    const context = passages.slice(0, 6).join('\n\n---\n\n');
    const sourceList = uniqueSources
      .slice(0, 5)
      .map(s => `Ch. ${s.chapter_number}: ${s.title}`)
      .join(', ');

    // Build conversation history for multi-turn
    const messages = [];

    if (history?.length) {
      for (const msg of history.slice(-6)) { // Keep last 6 messages for context
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: question });

    // Step 3: Call Claude
    const systemPrompt = context
      ? `You are a knowledgeable anatomy and biology tutor helping a college student study. You have access to their textbook content below. Answer questions conversationally, clearly, and accurately based on this textbook content.

Rules:
- Explain concepts in a friendly, easy-to-understand way — like a helpful tutor, not a textbook
- Use the textbook passages as your source of truth
- Bold important terms using **term**
- If the textbook content doesn't contain enough information to answer, say so honestly: "I couldn't find specific information about that in your textbook, but here's what I can share..." and give a brief general answer if possible
- At the end of your response, on a new line, write "Sources: ${sourceList}" so the student knows where to look
- Keep answers concise but thorough — 2-4 paragraphs max
- If the student asks a follow-up, use the conversation context

Textbook passages:
${context}`
      : `You are a helpful anatomy and biology tutor. The student asked a question but no relevant textbook content was found. Let them know politely that you couldn't find information about this topic in their uploaded textbook, and suggest they check if the relevant chapter has been uploaded.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(500).json({ error: 'Claude API error: ' + err.slice(0, 200) });
    }

    const claudeData = await claudeRes.json();
    const answer = claudeData.content?.[0]?.text || 'Sorry, I couldn\'t generate a response.';

    return res.status(200).json({
      answer,
      sources: uniqueSources.slice(0, 5),
    });
  } catch (err) {
    console.error('Chat error:', err);
    return res.status(500).json({ error: 'Failed to process question: ' + err.message });
  }
}

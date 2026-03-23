import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: generate a clean study definition
// Uses Gemini embeddings for semantic search + Gemini/Claude for definition generation

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

  if (!res.ok) return null;
  const data = await res.json();
  return data.embedding.values;
}

const DEFINITION_PROMPT = (termName, passage) => `You are creating a study flashcard definition for an anatomy/biology student.

Term: "${termName}"

Textbook passage:
"${passage}"

Write a concise 1-3 sentence definition of "${termName}" that a student can easily memorize. Include:
- What it IS (structure/type)
- Where it is located (if applicable)
- What it does / its function (if applicable)

Rules:
- Be direct and factual — start with what the term IS
- Do not include pronunciation guides or figure references
- Do not start with the term name itself
- Do not say "In anatomy" or "In biology"
- Maximum 2-3 short sentences
- Write at a college textbook level`;

async function generateWithGemini(termName, passage, geminiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DEFINITION_PROMPT(termName, passage) }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.2 },
      }),
    }
  );

  if (!res.ok) return null;
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function generateWithClaude(termName, passage, anthropicKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: DEFINITION_PROMPT(termName, passage) }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { termId, termName, courseId } = req.body;
  if (!termName || !courseId) {
    return res.status(400).json({ error: 'termName and courseId are required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let passage = null;
    let chapterNumber = null;
    let sourceChapter = null;

    // Step 1: Find the best textbook passage using semantic search
    if (geminiKey) {
      const queryEmbedding = await embedQuery(termName, geminiKey);
      if (queryEmbedding) {
        const { data: semanticResults } = await supabase.rpc('semantic_search_course', {
          query_embedding: JSON.stringify(queryEmbedding),
          p_course_id: courseId,
          match_count: 3,
        });

        if (semanticResults?.length > 0) {
          // Combine top results for richer context
          passage = semanticResults
            .filter(r => r.similarity > 0.3)
            .map(r => r.content)
            .join('\n\n')
            .slice(0, 3000);
          chapterNumber = semanticResults[0].chapter_number;
          sourceChapter = semanticResults[0].chapter_title;
        }
      }
    }

    // Fallback to FTS if semantic search found nothing
    if (!passage) {
      const { data: results } = await supabase.rpc('extract_term_context', {
        p_course_id: courseId,
        p_term: termName,
      });

      const ctx = results?.[0];
      if (ctx?.passage) {
        passage = ctx.passage;
        chapterNumber = ctx.chapter_number;
        sourceChapter = ctx.source_chapter;
      }
    }

    if (!passage) {
      return res.status(200).json({ definition: null, source: null });
    }

    const source = sourceChapter ? `Ch. ${chapterNumber}: ${sourceChapter}` : '';

    // Step 2: Generate a clean definition using AI
    let definition = null;

    // Try Claude first (higher quality), then Gemini
    if (anthropicKey) {
      definition = await generateWithClaude(termName, passage, anthropicKey);
    }

    if (!definition && geminiKey) {
      definition = await generateWithGemini(termName, passage, geminiKey);
    }

    // Last resort: cleaned FTS passage (no AI)
    if (!definition) {
      const { data: fallback } = await supabase.rpc('find_clean_definition', {
        p_course_id: courseId,
        p_term: termName,
      });
      definition = fallback?.[0]?.definition;
    }

    if (!definition) {
      return res.status(200).json({ definition: null, source: null });
    }

    // Step 3: Save to term
    if (termId) {
      await supabase.from('terms').update({
        definition,
        notes: source ? `Source: ${source}` : '',
        updated_at: new Date().toISOString(),
      }).eq('id', termId);
    }

    return res.status(200).json({ definition, source });
  } catch (err) {
    console.error('Generate definition error:', err);
    return res.status(500).json({ error: 'Failed to generate definition' });
  }
}

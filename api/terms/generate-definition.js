import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: generate a clean study definition
// Uses Claude Haiku to summarize textbook passages into concise definitions

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

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Extract rich context from the textbook
    const { data: results, error: ctxError } = await supabase.rpc('extract_term_context', {
      p_course_id: courseId,
      p_term: termName,
    });

    const ctx = results?.[0];
    if (!ctx?.passage) {
      return res.status(200).json({ definition: null, source: null });
    }

    const source = ctx.source_chapter
      ? `Ch. ${ctx.chapter_number}: ${ctx.source_chapter}`
      : '';

    let definition;

    if (anthropicKey) {
      // Use Claude Haiku to generate a clean study definition
      const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You are creating a study flashcard definition for an anatomy/biology student.

Term: "${termName}"

Textbook passage:
"${ctx.passage}"

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
- Write at a college textbook level`
          }],
        }),
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        definition = aiData.content?.[0]?.text?.trim();
      }
    }

    // Fallback: use the cleaned passage directly if no AI key or AI failed
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

    // Save to the term if termId provided
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

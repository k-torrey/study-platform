import { createClient } from '@supabase/supabase-js';

// Generate definitions from textbook content
// Strategy: find the textbook's OWN definition of each term
// Textbooks introduce terms with: "Term Name The term name is [definition]."

const SKIP_TITLES = ['table of contents', 'index', 'preface'];
const MAX_CHAPTER_CHARS = 120000;

function cleanTermName(termName) {
  return termName.toLowerCase()
    .replace(/^[-–—\s]+/, '')
    .replace(/[-–—\s]+$/, '')
    .replace(/\s*=\s*.+$/, '')
    .replace(/\s*[-–]\s*(ball|hinge|pivot|plane|saddle|condyloid|synovial|fibrous).*$/i, '')
    .replace(/\s*\(.+\)$/, '')
    .trim();
}

function isJunk(sent) {
  const digits = (sent.match(/\d/g) || []).length;
  if (digits / sent.length > 0.12) return true;
  if (/\d+,\s*\d+,\s*\d+/.test(sent)) return true;
  if (/DEEPER INSIGHT|Apply What You Know|\[box\]/i.test(sent)) return true;
  if (/\b(quiz|test your|check your|study guide|review question)\b/i.test(sent)) return true;
  if (/\?\s*$/.test(sent)) return true;
  if (/\b[a-d]\.\s+\w+\s+[a-d]\.\s+\w+/i.test(sent)) return true;
  if (sent.length < 25 || sent.length > 400) return true;
  return false;
}

// Strategy 1: Find the textbook's heading-style definition
// Pattern: "Radius The radius is..." or "Pectoral Girdle The pectoral girdle..."
function findHeadingDefinition(text, cleanTerm) {
  // Build pattern: [Term] The [term] (is|are|has|consists)
  const escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|[.\\n])\\s*(?:[A-Z][a-z]*\\s+)*${escaped}\\s+The\\s+${escaped}\\s+(is|are|has|consists?)\\b[^.]{20,250}\\.`,
    'i'
  );

  const match = text.match(pattern);
  if (match) return match[0].replace(/^[.\n]\s*/, '').trim();

  // Also try: "The [term] is/are..." at a sentence start
  const pattern2 = new RegExp(
    `(?:^|[.!]\\s+)The\\s+${escaped}\\s+(is|are)\\s+(a|an|the|one)\\b[^.]{15,250}\\.`,
    'i'
  );

  const match2 = text.match(pattern2);
  if (match2) return match2[0].replace(/^[.!]\s+/, '').trim();

  return null;
}

// Strategy 2: Score sentences by how definitional they are
function scoreSentence(sent, cleanTerm) {
  if (isJunk(sent)) return -100;

  const lower = sent.toLowerCase();
  const termWords = cleanTerm.split(/\s+/).filter(w => w.length > 2);
  if (termWords.length === 0) return -100;

  // Must contain term or most words
  const fullMatch = lower.includes(cleanTerm);
  const wordMatches = termWords.filter(w => lower.includes(w)).length;
  if (!fullMatch && wordMatches < Math.ceil(termWords.length * 0.7)) return -100;

  let score = fullMatch ? 20 : wordMatches * 4;

  // KEY FIX: Is the term the SUBJECT of the sentence? (before "is/are")
  const isAreMatch = lower.match(/\b(is|are)\s+(a|an|the|one|composed|made|formed|located|found|attached|responsible)/);
  if (isAreMatch) {
    const isArePos = isAreMatch.index;
    const termPos = lower.indexOf(cleanTerm);

    if (termPos >= 0 && termPos < isArePos) {
      // Term comes BEFORE "is/are" = term is the subject = DEFINITION
      score += 40;
    } else if (termPos > isArePos) {
      // Term comes AFTER "is/are" = term is in the predicate = REFERENCE to something else
      score -= 10;
    }
  }

  // Term after "of the", "for the", "near the" = prepositional reference, NOT a definition
  const prepPattern = new RegExp(`\\b(of|for|near|from|to|with|by|at)\\s+the\\s+${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (prepPattern.test(sent)) score -= 15;

  // "called the [term]" pattern — definition of something else
  const calledPattern = new RegExp(`called\\s+(the\\s+)?${cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  if (calledPattern.test(sent) && lower.indexOf(cleanTerm) > sent.length * 0.5) score -= 10;

  // Definitional verbs
  if (/\brefers? to\b/.test(lower)) score += 10;
  if (/\bdefined as\b/.test(lower)) score += 12;
  if (/\bconsists? of\b/.test(lower)) score += 6;

  // Anatomy structural words
  if (/\b(bone|ligament|muscle|joint|tendon|nerve|cartilage|membrane|fossa|process|tuberosity)\b/i.test(lower)) score += 3;
  if (/\b(connects?|attaches?|extends?|articulates?|supports?)\b/i.test(lower)) score += 3;
  if (/\b(anterior|posterior|medial|lateral|superior|inferior|proximal|distal)\b/i.test(lower)) score += 2;

  // Penalties
  if (/\bsee\s+(chapter|section|p\.|fig)/i.test(sent)) score -= 8;
  if (/\b(learning|objective|outcome)\b/i.test(lower)) score -= 10;

  // Term near start of sentence = likely the subject
  const firstTermWord = lower.indexOf(termWords[0]);
  if (firstTermWord >= 0 && firstTermWord < 15) score += 8;

  // Prefer medium-length sentences
  if (sent.length >= 50 && sent.length <= 200) score += 3;

  return score;
}

function cleanDef(raw) {
  let def = raw
    .replace(/\s*\(fig[^)]*\)?\s*/gi, ' ')
    .replace(/\s*\(see[^)]*\)?\s*/gi, ' ')
    .replace(/\s*\([A-Z]{2,}[^)]*\)/g, ' ')
    .replace(/\s*\([a-z]+-[A-Z]{2,}[^)]*\)/g, ' ')
    .replace(/\s+\d{1,2}\s+/g, ' ')
    .replace(/\s+\d{1,2}$/g, '')
    .replace(/^\d{1,2}\s+/g, '')
    .replace(/\*+/g, '')
    .replace(/['ʼ']\s*/g, ' ')
    .replace(/\[caption\][^.]*/gi, '')
    .replace(/Figure\s+\d+\.\d+[^.]*\./gi, '')
    .replace(/\w+\s*=\s*\w+[^.]*;/g, '')
    .replace(/\b\w{2,}\s*=\s*\w[^.;]{0,25};?\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Truncate at "(see"
  const seeIdx = def.toLowerCase().lastIndexOf('(see');
  if (seeIdx > def.length * 0.5) def = def.slice(0, seeIdx).trim();

  // If starts with lowercase, skip to next sentence
  if (/^[a-z]/.test(def)) {
    const next = def.search(/[.!]\s+[A-Z]/);
    if (next > 0 && next < def.length - 20) {
      def = def.slice(next + 2).trim();
    } else {
      return '';
    }
  }

  // Remove heading prefix: "Clavicle The clavicle" → "The clavicle"
  const headingMatch = def.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(The\s+)/i);
  if (headingMatch) {
    def = def.slice(headingMatch[1].length).trim();
  }

  // Trim to 1-2 sentences if long
  if (def.length > 250) {
    const sentEnd = def.search(/[.!]\s+[A-Z]/);
    if (sentEnd > 30 && sentEnd < 250) def = def.slice(0, sentEnd + 1);
  }

  // Remove remaining footnote patterns
  def = def.replace(/\b\w{2,}\s*=\s*\w[^.;,]{0,20}[;,]\s*/g, '').trim();

  if (def && !/[.!]$/.test(def)) def += '.';

  return def;
}

function extractDefinition(chapters, termName) {
  const cleanTerm = cleanTermName(termName);

  // STRATEGY 1: Search for textbook heading-style definition first
  for (const ch of chapters) {
    const text = ch.content.slice(0, MAX_CHAPTER_CHARS).replace(/\s+/g, ' ');
    const headingDef = findHeadingDefinition(text, cleanTerm);
    if (headingDef) {
      const cleaned = cleanDef(headingDef);
      if (cleaned && cleaned.length > 15 && /^[A-Z]/.test(cleaned)) {
        return {
          definition: cleaned,
          chapter_number: ch.chapter_number,
          source_chapter: ch.title,
        };
      }
    }
  }

  // STRATEGY 2: Window extraction + sentence scoring
  const allSentences = [];

  for (const ch of chapters) {
    const text = ch.content.slice(0, MAX_CHAPTER_CHARS).replace(/\s+/g, ' ');
    const lower = text.toLowerCase();

    let searchPos = 0;
    const positions = [];
    while (true) {
      const idx = lower.indexOf(cleanTerm, searchPos);
      if (idx === -1) break;
      positions.push(idx);
      searchPos = idx + 1;
    }

    if (positions.length === 0) {
      const keyWords = cleanTerm.split(/\s+/).filter(w => w.length > 4);
      for (const word of keyWords) {
        let pos = 0;
        while (positions.length < 10) {
          const idx = lower.indexOf(word, pos);
          if (idx === -1) break;
          positions.push(idx);
          pos = idx + 1;
        }
      }
    }

    if (positions.length === 0) continue;

    const windows = new Set();
    for (const pos of positions.slice(0, 8)) {
      let start = Math.max(0, pos - 300);
      const end = Math.min(text.length, pos + cleanTerm.length + 400);

      const prefixText = text.slice(start, pos);
      const sentStart = prefixText.search(/[.!]\s+[A-Z][^.]*$/);
      if (sentStart >= 0) {
        start = start + sentStart + 2;
      } else {
        const spaceIdx = text.indexOf(' ', start);
        if (spaceIdx > start && spaceIdx < start + 30) start = spaceIdx + 1;
      }

      windows.add(text.slice(start, end));
    }

    for (const window of windows) {
      const sentences = window.split(/(?<=[.!])\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 25);
      for (const sent of sentences) {
        const score = scoreSentence(sent, cleanTerm);
        if (score > 0) {
          allSentences.push({ sent, score, chapter: ch });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const unique = allSentences.filter(s => {
    const key = s.sent.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => b.score - a.score);

  // Try top candidates
  for (const candidate of unique.slice(0, 8)) {
    const cleaned = cleanDef(candidate.sent);
    if (cleaned && cleaned.length > 15 && /^[A-Z]/.test(cleaned)) {
      return {
        definition: cleaned,
        chapter_number: candidate.chapter.chapter_number,
        source_chapter: candidate.chapter.title,
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { terms, courseId } = req.body;
  if (!courseId || !terms?.length) {
    return res.status(400).json({ error: 'courseId and terms[] required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: textbooks } = await supabase
      .from('textbooks').select('id').eq('course_id', courseId);
    const textbookIds = (textbooks || []).map(t => t.id);

    if (textbookIds.length === 0) {
      return res.status(200).json({ filled: 0, definitions: {} });
    }

    // FAST PATH: Get FTS snippets for each term (lightweight, no full chapter loads)
    const termSnippets = [];
    for (const t of terms) {
      const clean = cleanTermName(t.term);
      const { data: fts } = await supabase.rpc('extract_term_context', {
        p_course_id: courseId,
        p_term: clean,
      });
      termSnippets.push({
        id: t.id,
        term: t.term,
        passage: fts?.[0]?.passage || '',
        chapter_number: fts?.[0]?.chapter_number || null,
        source_chapter: fts?.[0]?.source_chapter || null,
      });
    }

    const termsWithContent = termSnippets.filter(t => t.passage);
    const termEntries = termsWithContent.map((t, i) =>
      `${i + 1}. "${t.term}": "${t.passage.slice(0, 500)}"`
    ).join('\n');

    const prompt = `You are creating flashcard definitions for an anatomy student. For each term below, I've provided a relevant textbook passage.

Write ONE concise sentence that defines the term. Rules:
- Start with what the term IS (e.g. "A flat, triangular bone..." or "The lateral bone of the forearm...")
- Include body location and function when relevant
- Do NOT start the definition with the term name itself
- NO figure numbers, page numbers, or pronunciation guides
- Each definition must be a single, complete, grammatically correct sentence
- Write at a college anatomy level, easy to memorize

Return ONLY a JSON object: {"exact term name": "definition sentence", ...}

Terms:
${termEntries}`;

    // Try Claude first (highest quality), then Gemini, then text extraction
    let aiDefinitions = null;

    if (anthropicKey && termsWithContent.length > 0) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (claudeRes.ok) {
          const data = await claudeRes.json();
          const text = data.content?.[0]?.text;
          if (text) {
            const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            // Find the JSON object in the response
            const jsonStart = cleaned.indexOf('{');
            const jsonEnd = cleaned.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
              aiDefinitions = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
            }
          }
        }
      } catch { /* Claude unavailable */ }
    }

    // Fallback to Gemini if Claude didn't work
    if (!aiDefinitions && geminiKey && termsWithContent.length > 0) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0.1, responseMimeType: 'application/json' },
            }),
          }
        );

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) aiDefinitions = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
        }
      } catch { /* Gemini unavailable */ }
    }

    let filled = 0;
    const results = {};

    for (const ts of termSnippets) {
      if (!ts.passage) continue;

      let def = null;
      let source = ts.source_chapter
        ? `Source: Ch. ${ts.chapter_number}: ${ts.source_chapter}`
        : '';

      // Try AI definition first
      if (aiDefinitions) {
        def = aiDefinitions[ts.term];
        if (!def) {
          const key = Object.keys(aiDefinitions).find(k => k.toLowerCase() === ts.term.toLowerCase());
          if (key) def = aiDefinitions[key];
        }
      }

      // Fallback: use the FTS passage directly (cleaned)
      if (!def || def.trim().length < 10) {
        def = ts.passage;
      }

      if (def && def.trim().length > 10) {
        await supabase.from('terms').update({
          definition: def.trim(),
          notes: source || '',
          updated_at: new Date().toISOString(),
        }).eq('id', ts.id);

        results[ts.term] = def.trim();
        filled++;
      }
    }

    return res.status(200).json({ filled, definitions: results });
  } catch (err) {
    console.error('Batch definition error:', err);
    return res.status(500).json({ error: err.message });
  }
}

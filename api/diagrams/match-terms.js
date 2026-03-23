import { createClient } from '@supabase/supabase-js';

// Match stored course images to terms by comparing captions to term names

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { courseId, sectionId } = req.body;
  if (!courseId || !sectionId) {
    return res.status(400).json({ error: 'courseId and sectionId required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Get all images for this course
    const { data: images } = await supabase
      .from('course_images')
      .select('id, image_url, caption')
      .eq('course_id', courseId);

    if (!images?.length) {
      return res.status(200).json({ matched: 0, message: 'No image sources found. Add an image source URL first.' });
    }

    // Get terms without images
    const { data: terms } = await supabase
      .from('terms')
      .select('id, term, image_url')
      .eq('section_id', sectionId)
      .order('id');

    const needsImage = terms.filter(t => !t.image_url || t.image_url === '');

    let matched = 0;

    for (const term of needsImage) {
      // Clean term name for matching
      const cleanTerm = term.term.toLowerCase()
        .replace(/^[-–—\s]+/, '')
        .replace(/[-–—\s]+$/, '')
        .replace(/\s*=\s*.+$/, '')
        .replace(/\s*[-–]\s*(ball|hinge|pivot|plane|saddle|condyloid|synovial|fibrous).*$/i, '')
        .replace(/\s*\(.+\)$/, '')
        .trim();

      if (!cleanTerm || cleanTerm.length < 3) continue;

      const termWords = cleanTerm.split(/\s+/).filter(w => w.length > 2);

      // Score each image caption against this term
      let bestImage = null;
      let bestScore = 0;

      for (const img of images) {
        const captionLower = img.caption.toLowerCase();
        let score = 0;

        // Full term match in caption
        if (captionLower.includes(cleanTerm)) {
          score += 20;
        }

        // Individual word matches
        const wordMatches = termWords.filter(w => captionLower.includes(w)).length;
        score += wordMatches * 5;

        // Require at least some match
        if (score > bestScore && (captionLower.includes(cleanTerm) || wordMatches >= Math.ceil(termWords.length * 0.6))) {
          bestScore = score;
          bestImage = img;
        }
      }

      if (bestImage) {
        await supabase.from('terms').update({
          image_url: bestImage.image_url,
          updated_at: new Date().toISOString(),
        }).eq('id', term.id);
        matched++;
      }
    }

    return res.status(200).json({
      matched,
      total: needsImage.length,
      unmatched: needsImage.length - matched,
    });
  } catch (err) {
    console.error('Match terms error:', err);
    return res.status(500).json({ error: err.message });
  }
}

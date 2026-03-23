import { createClient } from '@supabase/supabase-js';

// Fetch a URL (e.g., OpenStax chapter), extract all images with captions

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, courseId } = req.body;
  if (!url || !courseId) {
    return res.status(400).json({ error: 'url and courseId required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Fetch the page
    const response = await fetch(url, {
      headers: { 'User-Agent': 'StudyPlatform/1.0 (Educational)' },
    });

    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch URL: ${response.status}` });
    }

    const html = await response.text();

    // Extract images with their captions/alt text
    const images = [];

    // Pattern 1: <figure> with <img> and <figcaption>
    const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
    let figMatch;
    while ((figMatch = figureRegex.exec(html)) !== null) {
      const figContent = figMatch[1];
      const imgMatch = figContent.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      const captionMatch = figContent.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
      const altMatch = figContent.match(/alt=["']([^"']+)["']/i);

      if (imgMatch) {
        let imgUrl = imgMatch[1];
        // Make relative URLs absolute
        if (imgUrl.startsWith('/')) {
          const urlObj = new URL(url);
          imgUrl = urlObj.origin + imgUrl;
        } else if (!imgUrl.startsWith('http')) {
          const base = url.substring(0, url.lastIndexOf('/') + 1);
          imgUrl = base + imgUrl;
        }

        const caption = captionMatch
          ? captionMatch[1].replace(/<[^>]+>/g, '').trim()
          : altMatch ? altMatch[1] : '';

        // Skip tiny icons, decorations, logos
        if (caption && caption.length > 5 && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
          images.push({ image_url: imgUrl, caption });
        }
      }
    }

    // Pattern 2: Standalone <img> with meaningful alt text (if few figures found)
    if (images.length < 5) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi;
      let imgMatch2;
      while ((imgMatch2 = imgRegex.exec(html)) !== null) {
        let imgUrl = imgMatch2[1];
        const alt = imgMatch2[2];

        if (imgUrl.startsWith('/')) {
          const urlObj = new URL(url);
          imgUrl = urlObj.origin + imgUrl;
        } else if (!imgUrl.startsWith('http')) {
          const base = url.substring(0, url.lastIndexOf('/') + 1);
          imgUrl = base + imgUrl;
        }

        if (alt && alt.length > 10 && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
          if (!images.some(i => i.image_url === imgUrl)) {
            images.push({ image_url: imgUrl, caption: alt });
          }
        }
      }
    }

    if (images.length === 0) {
      return res.status(200).json({ count: 0, message: 'No figures found on this page' });
    }

    // Store images in database
    const rows = images.map(img => ({
      course_id: courseId,
      image_url: img.image_url,
      caption: img.caption,
      source_url: url,
    }));

    // Avoid duplicates
    const { data: existing } = await supabase
      .from('course_images')
      .select('image_url')
      .eq('course_id', courseId);
    const existingUrls = new Set((existing || []).map(e => e.image_url));
    const newRows = rows.filter(r => !existingUrls.has(r.image_url));

    if (newRows.length > 0) {
      await supabase.from('course_images').insert(newRows);
    }

    return res.status(200).json({
      count: newRows.length,
      total: images.length,
      skipped: images.length - newRows.length,
    });
  } catch (err) {
    console.error('Fetch URL error:', err);
    return res.status(500).json({ error: 'Failed to process URL: ' + err.message });
  }
}

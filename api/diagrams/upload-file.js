import { createClient } from '@supabase/supabase-js';

// Extract images from an uploaded PDF/HTML file
// PDFs: extracts embedded images using pdf-parse page text + stores pages as image context
// Images (jpg/png): stores directly as a diagram with the filename as caption

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileBase64, fileName, courseId } = req.body;
  if (!fileBase64 || !fileName || !courseId) {
    return res.status(400).json({ error: 'fileBase64, fileName, and courseId required' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const ext = fileName.split('.').pop().toLowerCase();

  try {
    const buffer = Buffer.from(fileBase64, 'base64');

    // For direct image files — store to Supabase Storage and save URL
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
      const storagePath = `diagrams/${courseId}/${Date.now()}_${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('term-images')
        .upload(storagePath, buffer, { contentType: mimeTypes[ext] || 'image/png' });

      if (uploadErr) {
        return res.status(500).json({ error: 'Upload failed: ' + uploadErr.message });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('term-images')
        .getPublicUrl(storagePath);

      const caption = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

      await supabase.from('course_images').insert({
        course_id: courseId,
        image_url: publicUrl,
        caption,
        source_url: `upload:${fileName}`,
      });

      return res.status(200).json({ count: 1, total: 1, skipped: 0 });
    }

    // For PDFs — extract page text for captions, and try to find embedded images
    if (ext === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);

      // PDF images are hard to extract directly. Instead, we'll:
      // 1. Upload the PDF pages as images via a different approach
      // 2. For now, extract figure references from the text and note them

      // Extract figure captions from the PDF text
      const figurePattern = /(?:Figure|Fig\.?)\s*(\d+[\.\d]*)[.:]\s*([^\n.]+)/gi;
      const figures = [];
      let match;
      while ((match = figurePattern.exec(data.text)) !== null) {
        figures.push({
          number: match[1],
          caption: `Figure ${match[1]}: ${match[2].trim()}`,
        });
      }

      // Store the PDF itself to Supabase Storage so we can reference it
      const storagePath = `diagrams/${courseId}/${Date.now()}_${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('term-images')
        .upload(storagePath, buffer, { contentType: 'application/pdf' });

      if (uploadErr) {
        return res.status(500).json({ error: 'Upload failed: ' + uploadErr.message });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('term-images')
        .getPublicUrl(storagePath);

      // Store each figure caption with the PDF URL as the image source
      // Users can then manually assign specific images
      const rows = figures.length > 0
        ? figures.map(f => ({
            course_id: courseId,
            image_url: publicUrl,
            caption: f.caption,
            source_url: `upload:${fileName}`,
          }))
        : [{
            course_id: courseId,
            image_url: publicUrl,
            caption: fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
            source_url: `upload:${fileName}`,
          }];

      // Avoid duplicates
      const { data: existing } = await supabase
        .from('course_images')
        .select('caption')
        .eq('course_id', courseId)
        .eq('source_url', `upload:${fileName}`);
      const existingCaptions = new Set((existing || []).map(e => e.caption));
      const newRows = rows.filter(r => !existingCaptions.has(r.caption));

      if (newRows.length > 0) {
        await supabase.from('course_images').insert(newRows);
      }

      return res.status(200).json({
        count: newRows.length,
        total: rows.length,
        skipped: rows.length - newRows.length,
        figures: figures.length,
      });
    }

    return res.status(400).json({ error: `Unsupported file type: .${ext}. Supported: images (jpg, png, gif, webp, svg) and PDF.` });
  } catch (err) {
    console.error('Upload file error:', err);
    return res.status(500).json({ error: 'Failed to process file: ' + err.message });
  }
}

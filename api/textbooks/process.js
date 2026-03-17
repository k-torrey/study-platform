import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: process uploaded textbook files (PDF/EPUB)
// This uses the service role key to bypass RLS for inserting chapters

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Verify the user's token
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { filePath, textbookId, courseId } = req.body;
  if (!filePath || !textbookId) {
    return res.status(400).json({ error: 'filePath and textbookId are required' });
  }

  // Service role client for storage download and chapter insertion
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('textbooks')
      .download(filePath);
    if (downloadError) {
      return res.status(400).json({ error: 'Failed to download file: ' + downloadError.message });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const ext = filePath.split('.').pop().toLowerCase();

    let chapters = [];

    if (ext === 'pdf') {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      const fullText = data.text;
      const numPages = data.numpages;

      // Try to detect chapter boundaries
      const chapterPattern = /^(Chapter\s+\d+[.:]\s*.+)/gim;
      const matches = [];
      let match;
      while ((match = chapterPattern.exec(fullText)) !== null) {
        matches.push({ index: match.index, title: match[1].trim() });
      }

      if (matches.length >= 2) {
        for (let i = 0; i < matches.length; i++) {
          const start = matches[i].index;
          const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
          chapters.push({
            chapter_number: i + 1,
            title: matches[i].title,
            content: fullText.slice(start, end).trim(),
          });
        }
      } else {
        // Fallback: split into ~20-page chunks
        const charsPerPage = Math.ceil(fullText.length / Math.max(numPages, 1));
        const chunkSize = charsPerPage * 20;
        for (let i = 0; i < fullText.length; i += chunkSize) {
          const chapterNum = chapters.length + 1;
          chapters.push({
            chapter_number: chapterNum,
            title: `Section ${chapterNum}`,
            content: fullText.slice(i, i + chunkSize).trim(),
          });
        }
      }
    } else if (ext === 'epub') {
      const AdmZip = (await import('adm-zip')).default;
      const { XMLParser } = await import('fast-xml-parser');

      const zip = new AdmZip(buffer);
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

      // Find container.xml
      const containerEntry = zip.getEntry('META-INF/container.xml');
      if (!containerEntry) {
        return res.status(400).json({ error: 'Invalid EPUB: missing container.xml' });
      }

      const containerXml = containerEntry.getData().toString('utf-8');
      const container = parser.parse(containerXml);
      const rootfilePath = container?.container?.rootfiles?.rootfile?.['@_full-path'];
      if (!rootfilePath) {
        return res.status(400).json({ error: 'Cannot find OPF path in container.xml' });
      }

      const opfEntry = zip.getEntry(rootfilePath);
      if (!opfEntry) {
        return res.status(400).json({ error: 'Cannot find OPF file' });
      }

      const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';
      const opfXml = opfEntry.getData().toString('utf-8');
      const opf = parser.parse(opfXml);

      // Build manifest map
      const manifest = {};
      const manifestItems = opf?.package?.manifest?.item;
      const items = Array.isArray(manifestItems) ? manifestItems : [manifestItems].filter(Boolean);
      for (const item of items) {
        manifest[item['@_id']] = item['@_href'];
      }

      // Get spine reading order
      const spineItems = opf?.package?.spine?.itemref;
      const spineRefs = Array.isArray(spineItems) ? spineItems : [spineItems].filter(Boolean);

      let chapterNum = 0;
      for (const ref of spineRefs) {
        const idref = ref['@_idref'];
        const href = manifest[idref];
        if (!href) continue;

        const itemPath = opfDir + href;
        const entry = zip.getEntry(itemPath);
        if (!entry) continue;

        const xhtml = entry.getData().toString('utf-8');

        // Strip HTML tags to get plain text
        const text = xhtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#\d+;/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length < 50) continue;

        chapterNum++;
        const titleMatch = xhtml.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
        const title = titleMatch
          ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
          : `Chapter ${chapterNum}`;

        chapters.push({ chapter_number: chapterNum, title, content: text });
      }
    } else {
      return res.status(400).json({ error: 'Unsupported file type: ' + ext });
    }

    if (chapters.length === 0) {
      return res.status(400).json({ error: 'No chapters could be extracted from the file' });
    }

    // Insert chapters
    const rows = chapters.map(ch => ({
      textbook_id: textbookId,
      chapter_number: ch.chapter_number,
      title: ch.title,
      content: ch.content,
    }));

    const { error: insertError } = await supabase
      .from('textbook_chapters')
      .insert(rows);

    if (insertError) {
      return res.status(500).json({ error: 'Failed to insert chapters: ' + insertError.message });
    }

    return res.status(200).json({ chapter_count: chapters.length });
  } catch (err) {
    console.error('Textbook processing error:', err);
    return res.status(500).json({ error: 'Processing failed' });
  }
}

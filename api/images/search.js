// Vercel serverless function: proxy image search to Wikimedia Commons
// This avoids CSP/CORS issues by making the request server-side

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q.trim())}&gsrlimit=20&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=300&format=json&origin=*`;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: 'Wikimedia API request failed' });
    }

    const data = await response.json();

    if (!data.query?.pages) {
      return res.status(200).json({ images: [] });
    }

    const images = Object.values(data.query.pages)
      .filter(p => p.imageinfo?.[0]?.thumburl)
      .map(p => ({
        thumb: p.imageinfo[0].thumburl,
        full: p.imageinfo[0].url,
        title: p.title.replace('File:', '').replace(/\.[^.]+$/, ''),
        description: (p.imageinfo[0].extmetadata?.ImageDescription?.value || '')
          .replace(/<[^>]+>/g, '')
          .substring(0, 100),
      }));

    return res.status(200).json({ images });
  } catch (err) {
    console.error('Image search error:', err);
    return res.status(500).json({ error: 'Image search failed' });
  }
}

// Vercel serverless function: extract text from uploaded PDF files
// Returns plain text that the client can then parse for terms

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileBase64, fileName } = req.body;
  if (!fileBase64 || !fileName) {
    return res.status(400).json({ error: 'fileBase64 and fileName are required' });
  }

  const ext = fileName.split('.').pop().toLowerCase();
  if (ext !== 'pdf') {
    return res.status(400).json({ error: 'Only PDF files are processed server-side. DOCX and TXT are handled client-side.' });
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');

    if (buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 20MB)' });
    }

    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);

    return res.status(200).json({ text: data.text, pageCount: data.numpages });
  } catch (err) {
    console.error('PDF text extraction error:', err);
    return res.status(500).json({ error: 'Failed to extract text from PDF' });
  }
}

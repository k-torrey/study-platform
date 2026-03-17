import { createClient } from '@supabase/supabase-js';

// Vercel serverless function: parse pasted textbook text
// Creates a textbook record with a single chapter

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const { title, content, courseId } = req.body;
  if (!title || !content || !courseId) {
    return res.status(400).json({ error: 'title, content, and courseId are required' });
  }

  if (content.length > 1_000_000) {
    return res.status(400).json({ error: 'Content too large (max 1MB)' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Create textbook record
    const { data: textbook, error: tbError } = await supabase
      .from('textbooks')
      .insert({ course_id: courseId, title, type: 'paste' })
      .select()
      .single();

    if (tbError) {
      return res.status(500).json({ error: 'Failed to create textbook: ' + tbError.message });
    }

    // Create single chapter
    const { error: chError } = await supabase
      .from('textbook_chapters')
      .insert({
        textbook_id: textbook.id,
        chapter_number: 1,
        title,
        content,
      });

    if (chError) {
      return res.status(500).json({ error: 'Failed to create chapter: ' + chError.message });
    }

    return res.status(200).json({ id: textbook.id, chapter_count: 1 });
  } catch (err) {
    console.error('Parse-paste error:', err);
    return res.status(500).json({ error: 'Processing failed' });
  }
}

-- ============================================================
-- Embedding Infrastructure: pgvector + textbook_chunks + semantic search
-- Syncs migration files with objects created in the live database
-- Safe to run against the live DB (uses IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ─── 1. pgvector Extension ────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;

-- ─── 2. image_url column on terms ─────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'terms' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.terms ADD COLUMN image_url TEXT DEFAULT '';
  END IF;
END $$;

-- ─── 3. textbook_chunks table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.textbook_chunks (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES public.textbook_chapters(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding extensions.vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chunks_chapter_id
  ON public.textbook_chunks(chapter_id);

-- HNSW index for fast approximate nearest-neighbor vector search
-- Only created if there are enough rows; otherwise exact search is fine
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.textbook_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── 4. textbook_chunks RLS ──────────────────────────────────

ALTER TABLE public.textbook_chunks ENABLE ROW LEVEL SECURITY;

-- Drop and recreate the insecure insert policy with proper ownership check
DROP POLICY IF EXISTS chunks_insert ON public.textbook_chunks;
CREATE POLICY chunks_insert ON public.textbook_chunks FOR INSERT
  WITH CHECK (
    chapter_id IN (
      SELECT tc.id FROM public.textbook_chapters tc
      JOIN public.textbooks tb ON tc.textbook_id = tb.id
      JOIN public.courses c ON tb.course_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- Recreate select/delete only if they don't exist (safe re-run)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chunks_select' AND tablename = 'textbook_chunks') THEN
    CREATE POLICY chunks_select ON public.textbook_chunks FOR SELECT
      USING (
        chapter_id IN (
          SELECT tc.id FROM public.textbook_chapters tc
          JOIN public.textbooks tb ON tc.textbook_id = tb.id
          JOIN public.courses c ON tb.course_id = c.id
          WHERE c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chunks_delete' AND tablename = 'textbook_chunks') THEN
    CREATE POLICY chunks_delete ON public.textbook_chunks FOR DELETE
      USING (
        chapter_id IN (
          SELECT tc.id FROM public.textbook_chapters tc
          JOIN public.textbooks tb ON tc.textbook_id = tb.id
          JOIN public.courses c ON tb.course_id = c.id
          WHERE c.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── 5. Semantic Search RPC Functions ────────────────────────

-- Search chunks within a specific textbook by vector cosine similarity
CREATE OR REPLACE FUNCTION semantic_search_chunks(
  query_embedding extensions.vector(768),
  p_textbook_id INTEGER,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE(
  chunk_id INTEGER,
  chapter_id INTEGER,
  chapter_number INTEGER,
  chapter_title TEXT,
  content TEXT,
  similarity FLOAT
) AS $$
  SELECT
    tc.id AS chunk_id,
    ch.id AS chapter_id,
    ch.chapter_number,
    ch.title AS chapter_title,
    tc.content,
    (1 - (tc.embedding OPERATOR(extensions.<=>) query_embedding))::FLOAT AS similarity
  FROM public.textbook_chunks tc
  JOIN public.textbook_chapters ch ON tc.chapter_id = ch.id
  WHERE ch.textbook_id = p_textbook_id
    AND tc.embedding IS NOT NULL
  ORDER BY tc.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Search chunks across ALL textbooks in a course (used by auto-fill definitions)
CREATE OR REPLACE FUNCTION semantic_search_course(
  query_embedding extensions.vector(768),
  p_course_id INTEGER,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE(
  chunk_id INTEGER,
  chapter_id INTEGER,
  chapter_number INTEGER,
  chapter_title TEXT,
  content TEXT,
  similarity FLOAT
) AS $$
  SELECT
    tc.id AS chunk_id,
    ch.id AS chapter_id,
    ch.chapter_number,
    ch.title AS chapter_title,
    tc.content,
    (1 - (tc.embedding OPERATOR(extensions.<=>) query_embedding))::FLOAT AS similarity
  FROM public.textbook_chunks tc
  JOIN public.textbook_chapters ch ON tc.chapter_id = ch.id
  JOIN public.textbooks tb ON ch.textbook_id = tb.id
  WHERE tb.course_id = p_course_id
    AND tc.embedding IS NOT NULL
  ORDER BY tc.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- ─── 6. FTS Fallback RPC Functions ──────────────────────────

-- Find the best textbook passage for a term using full-text search
CREATE OR REPLACE FUNCTION extract_term_context(p_course_id INTEGER, p_term TEXT)
RETURNS TABLE(passage TEXT, chapter_number INTEGER, source_chapter TEXT) AS $$
  SELECT
    ts_headline('english', tc.content, plainto_tsquery('english', p_term),
      'StartSel=, StopSel=, MaxWords=80, MinWords=40') AS passage,
    tc.chapter_number,
    tc.title AS source_chapter
  FROM public.textbook_chapters tc
  JOIN public.textbooks tb ON tc.textbook_id = tb.id
  WHERE tb.course_id = p_course_id
    AND tc.fts @@ plainto_tsquery('english', p_term)
  ORDER BY ts_rank(tc.fts, plainto_tsquery('english', p_term)) DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Last-resort: extract a shorter cleaned passage for use as a raw definition
CREATE OR REPLACE FUNCTION find_clean_definition(p_course_id INTEGER, p_term TEXT)
RETURNS TABLE(definition TEXT) AS $$
  SELECT
    ts_headline('english', tc.content, plainto_tsquery('english', p_term),
      'StartSel=, StopSel=, MaxWords=50, MinWords=20') AS definition
  FROM public.textbook_chapters tc
  JOIN public.textbooks tb ON tc.textbook_id = tb.id
  WHERE tb.course_id = p_course_id
    AND tc.fts @@ plainto_tsquery('english', p_term)
  ORDER BY ts_rank(tc.fts, plainto_tsquery('english', p_term)) DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

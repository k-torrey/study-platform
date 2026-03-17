-- ============================================================
-- Study Platform: PostgreSQL schema for Supabase
-- Migrated from SQLite (sql.js) to PostgreSQL with RLS + FTS
-- ============================================================

-- ─── Tables ─────────────────────────────────────────────────

CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sections (
  id SERIAL PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE terms (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE study_progress (
  id SERIAL PRIMARY KEY,
  term_id INTEGER NOT NULL UNIQUE REFERENCES terms(id) ON DELETE CASCADE,
  ease_factor REAL DEFAULT 2.5,
  interval INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review TIMESTAMPTZ DEFAULT NULL,
  last_reviewed TIMESTAMPTZ DEFAULT NULL,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'unseen',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE textbooks (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filename TEXT DEFAULT '',
  type TEXT DEFAULT 'paste',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE textbook_chapters (
  id SERIAL PRIMARY KEY,
  textbook_id INTEGER NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
  chapter_number INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  content TEXT NOT NULL
);

CREATE TABLE section_textbook_links (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  textbook_chapter_id INTEGER NOT NULL REFERENCES textbook_chapters(id) ON DELETE CASCADE,
  excerpt TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notes (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL UNIQUE REFERENCES sections(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes (critical for RLS performance) ─────────────────

CREATE INDEX idx_courses_user_id ON courses(user_id);
CREATE INDEX idx_exams_course_id ON exams(course_id);
CREATE INDEX idx_sections_exam_id ON sections(exam_id);
CREATE INDEX idx_terms_section_id ON terms(section_id);
CREATE INDEX idx_study_progress_term_id ON study_progress(term_id);
CREATE INDEX idx_textbooks_course_id ON textbooks(course_id);
CREATE INDEX idx_textbook_chapters_textbook_id ON textbook_chapters(textbook_id);
CREATE INDEX idx_section_textbook_links_section_id ON section_textbook_links(section_id);
CREATE INDEX idx_notes_section_id ON notes(section_id);

-- ─── Full-Text Search ───────────────────────────────────────

ALTER TABLE textbook_chapters ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX idx_textbook_chapters_fts ON textbook_chapters USING GIN(fts);

-- ─── RLS Helper Functions ───────────────────────────────────

CREATE OR REPLACE FUNCTION user_owns_course(cid INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.courses WHERE id = cid AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION user_owns_exam(eid INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.exams e
    JOIN public.courses c ON e.course_id = c.id
    WHERE e.id = eid AND c.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION user_owns_section(sid INTEGER)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.sections s
    JOIN public.exams e ON s.exam_id = e.id
    JOIN public.courses c ON e.course_id = c.id
    WHERE s.id = sid AND c.user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- ─── Row-Level Security ─────────────────────────────────────

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_policy ON courses FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
CREATE POLICY exams_select ON exams FOR SELECT USING (user_owns_course(course_id));
CREATE POLICY exams_insert ON exams FOR INSERT WITH CHECK (user_owns_course(course_id));
CREATE POLICY exams_update ON exams FOR UPDATE USING (user_owns_course(course_id));
CREATE POLICY exams_delete ON exams FOR DELETE USING (user_owns_course(course_id));

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY sections_select ON sections FOR SELECT USING (user_owns_exam(exam_id));
CREATE POLICY sections_insert ON sections FOR INSERT WITH CHECK (user_owns_exam(exam_id));
CREATE POLICY sections_update ON sections FOR UPDATE USING (user_owns_exam(exam_id));
CREATE POLICY sections_delete ON sections FOR DELETE USING (user_owns_exam(exam_id));

ALTER TABLE terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY terms_select ON terms FOR SELECT USING (user_owns_section(section_id));
CREATE POLICY terms_insert ON terms FOR INSERT WITH CHECK (user_owns_section(section_id));
CREATE POLICY terms_update ON terms FOR UPDATE USING (user_owns_section(section_id));
CREATE POLICY terms_delete ON terms FOR DELETE USING (user_owns_section(section_id));

ALTER TABLE study_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY study_progress_select ON study_progress FOR SELECT
  USING (term_id IN (SELECT id FROM public.terms WHERE user_owns_section(section_id)));
CREATE POLICY study_progress_insert ON study_progress FOR INSERT
  WITH CHECK (term_id IN (SELECT id FROM public.terms WHERE user_owns_section(section_id)));
CREATE POLICY study_progress_update ON study_progress FOR UPDATE
  USING (term_id IN (SELECT id FROM public.terms WHERE user_owns_section(section_id)));
CREATE POLICY study_progress_delete ON study_progress FOR DELETE
  USING (term_id IN (SELECT id FROM public.terms WHERE user_owns_section(section_id)));

ALTER TABLE textbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY textbooks_select ON textbooks FOR SELECT USING (user_owns_course(course_id));
CREATE POLICY textbooks_insert ON textbooks FOR INSERT WITH CHECK (user_owns_course(course_id));
CREATE POLICY textbooks_update ON textbooks FOR UPDATE USING (user_owns_course(course_id));
CREATE POLICY textbooks_delete ON textbooks FOR DELETE USING (user_owns_course(course_id));

ALTER TABLE textbook_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY textbook_chapters_select ON textbook_chapters FOR SELECT
  USING (textbook_id IN (SELECT id FROM public.textbooks WHERE user_owns_course(course_id)));
CREATE POLICY textbook_chapters_insert ON textbook_chapters FOR INSERT
  WITH CHECK (textbook_id IN (SELECT id FROM public.textbooks WHERE user_owns_course(course_id)));
CREATE POLICY textbook_chapters_delete ON textbook_chapters FOR DELETE
  USING (textbook_id IN (SELECT id FROM public.textbooks WHERE user_owns_course(course_id)));

ALTER TABLE section_textbook_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY stl_select ON section_textbook_links FOR SELECT USING (user_owns_section(section_id));
CREATE POLICY stl_insert ON section_textbook_links FOR INSERT WITH CHECK (user_owns_section(section_id));
CREATE POLICY stl_delete ON section_textbook_links FOR DELETE USING (user_owns_section(section_id));

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_select ON notes FOR SELECT USING (user_owns_section(section_id));
CREATE POLICY notes_insert ON notes FOR INSERT WITH CHECK (user_owns_section(section_id));
CREATE POLICY notes_update ON notes FOR UPDATE USING (user_owns_section(section_id));
CREATE POLICY notes_delete ON notes FOR DELETE USING (user_owns_section(section_id));

-- ─── RPC Functions (aggregate queries + search) ─────────────

-- Get courses with stats for the current user
CREATE OR REPLACE FUNCTION get_courses_with_stats()
RETURNS TABLE(
  id INTEGER, user_id UUID, name TEXT, title TEXT, color TEXT, created_at TIMESTAMPTZ,
  exam_count BIGINT, term_count BIGINT
) AS $$
  SELECT c.id, c.user_id, c.name, c.title, c.color, c.created_at,
    (SELECT COUNT(*) FROM public.exams WHERE course_id = c.id) AS exam_count,
    (SELECT COUNT(*) FROM public.terms t
     JOIN public.sections s ON t.section_id = s.id
     JOIN public.exams e ON s.exam_id = e.id
     WHERE e.course_id = c.id) AS term_count
  FROM public.courses c
  WHERE c.user_id = auth.uid()
  ORDER BY c.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Get exams with stats
CREATE OR REPLACE FUNCTION get_exams_with_stats(p_course_id INTEGER)
RETURNS TABLE(
  id INTEGER, course_id INTEGER, name TEXT, date TEXT, created_at TIMESTAMPTZ,
  section_count BIGINT, term_count BIGINT
) AS $$
  SELECT e.id, e.course_id, e.name, e.date, e.created_at,
    (SELECT COUNT(*) FROM public.sections WHERE exam_id = e.id) AS section_count,
    (SELECT COUNT(*) FROM public.terms t
     JOIN public.sections s ON t.section_id = s.id
     WHERE s.exam_id = e.id) AS term_count
  FROM public.exams e
  JOIN public.courses c ON e.course_id = c.id
  WHERE e.course_id = p_course_id AND c.user_id = auth.uid()
  ORDER BY e.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Get sections with stats
CREATE OR REPLACE FUNCTION get_sections_with_stats(p_exam_id INTEGER)
RETURNS TABLE(
  id INTEGER, exam_id INTEGER, name TEXT, sort_order INTEGER, created_at TIMESTAMPTZ,
  term_count BIGINT
) AS $$
  SELECT s.id, s.exam_id, s.name, s.sort_order, s.created_at,
    (SELECT COUNT(*) FROM public.terms WHERE section_id = s.id) AS term_count
  FROM public.sections s
  JOIN public.exams e ON s.exam_id = e.id
  JOIN public.courses c ON e.course_id = c.id
  WHERE s.exam_id = p_exam_id AND c.user_id = auth.uid()
  ORDER BY s.sort_order, s.id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Get textbooks with chapter count
CREATE OR REPLACE FUNCTION get_textbooks_with_stats(p_course_id INTEGER)
RETURNS TABLE(
  id INTEGER, course_id INTEGER, title TEXT, filename TEXT, type TEXT, created_at TIMESTAMPTZ,
  chapter_count BIGINT
) AS $$
  SELECT tb.id, tb.course_id, tb.title, tb.filename, tb.type, tb.created_at,
    (SELECT COUNT(*) FROM public.textbook_chapters WHERE textbook_id = tb.id) AS chapter_count
  FROM public.textbooks tb
  JOIN public.courses c ON tb.course_id = c.id
  WHERE tb.course_id = p_course_id AND c.user_id = auth.uid()
  ORDER BY tb.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Full-text search on textbook chapters
CREATE OR REPLACE FUNCTION search_textbook_chapters(textbook_id_input INTEGER, query TEXT)
RETURNS TABLE(id INTEGER, chapter_number INTEGER, title TEXT, snippet TEXT) AS $$
  SELECT tc.id, tc.chapter_number, tc.title,
    ts_headline('english', tc.content, plainto_tsquery('english', query),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15') AS snippet
  FROM public.textbook_chapters tc
  WHERE tc.textbook_id = textbook_id_input
    AND tc.fts @@ plainto_tsquery('english', query)
  ORDER BY ts_rank(tc.fts, plainto_tsquery('english', query)) DESC
  LIMIT 20;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

-- Get section textbook links with chapter/textbook info
CREATE OR REPLACE FUNCTION get_section_links(p_section_id INTEGER)
RETURNS TABLE(
  id INTEGER, section_id INTEGER, textbook_chapter_id INTEGER,
  excerpt TEXT, note TEXT, created_at TIMESTAMPTZ,
  chapter_title TEXT, chapter_number INTEGER, textbook_title TEXT
) AS $$
  SELECT stl.id, stl.section_id, stl.textbook_chapter_id,
    stl.excerpt, stl.note, stl.created_at,
    tc.title AS chapter_title, tc.chapter_number, tb.title AS textbook_title
  FROM public.section_textbook_links stl
  JOIN public.textbook_chapters tc ON stl.textbook_chapter_id = tc.id
  JOIN public.textbooks tb ON tc.textbook_id = tb.id
  WHERE stl.section_id = p_section_id
  ORDER BY stl.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '';

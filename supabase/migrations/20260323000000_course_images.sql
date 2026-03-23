-- Course images: stores figures fetched from external sources (OpenStax, URLs)
-- Used by the Diagrams tab for visual term matching and diagram quiz

CREATE TABLE IF NOT EXISTS public.course_images (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_images_course_id ON public.course_images(course_id);

ALTER TABLE public.course_images ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'course_images_select') THEN
    CREATE POLICY course_images_select ON public.course_images FOR SELECT
      USING (course_id IN (SELECT id FROM public.courses WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'course_images_insert') THEN
    CREATE POLICY course_images_insert ON public.course_images FOR INSERT
      WITH CHECK (course_id IN (SELECT id FROM public.courses WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'course_images_delete') THEN
    CREATE POLICY course_images_delete ON public.course_images FOR DELETE
      USING (course_id IN (SELECT id FROM public.courses WHERE user_id = auth.uid()));
  END IF;
END $$;

import { z } from 'zod';

export const courseSchema = z.object({
  name: z.string().trim().min(1, 'Course code is required').max(100, 'Course code too long'),
  title: z.string().trim().max(200, 'Title too long').default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color').default('#6366f1'),
});

export const examSchema = z.object({
  name: z.string().trim().min(1, 'Exam name is required').max(100, 'Name too long'),
  date: z.string().nullable().optional(),
});

export const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Section name is required').max(100, 'Name too long'),
});

export const termSchema = z.object({
  term: z.string().trim().min(1, 'Term is required').max(5000, 'Term too long'),
  definition: z.string().trim().min(1, 'Definition is required').max(5000, 'Definition too long'),
  notes: z.string().trim().max(5000, 'Notes too long').default(''),
});

export const notesSchema = z.object({
  content: z.string().max(50000, 'Notes content too long'),
});

export const textbookPasteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(1000000, 'Content too large (max 1MB)'),
});

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map(i => i.message).join(', ');
    throw new Error(msg);
  }
  return result.data;
}

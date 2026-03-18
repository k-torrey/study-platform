import { supabase } from './supabase';
import { calculateSR } from './sr';
import { validate, courseSchema, examSchema, sectionSchema, termSchema, notesSchema, textbookPasteSchema } from './validation';

// ─── Helper ──────────────────────────────────────────────────

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ─── Courses ─────────────────────────────────────────────────

export async function getCourses() {
  return unwrap(await supabase.rpc('get_courses_with_stats'));
}

export async function createCourse(fields) {
  const validated = validate(courseSchema, fields);
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(
    await supabase.from('courses')
      .insert({ ...validated, user_id: user.id })
      .select()
      .single()
  );
}

export async function updateCourse(id, fields) {
  const validated = validate(courseSchema, fields);
  return unwrap(
    await supabase.from('courses').update(validated).eq('id', id).select().single()
  );
}

export async function deleteCourse(id) {
  return unwrap(await supabase.from('courses').delete().eq('id', id));
}

// ─── Exams ───────────────────────────────────────────────────

export async function getExams(courseId) {
  return unwrap(await supabase.rpc('get_exams_with_stats', { p_course_id: courseId }));
}

export async function createExam(courseId, fields) {
  const validated = validate(examSchema, fields);
  return unwrap(
    await supabase.from('exams')
      .insert({ ...validated, course_id: courseId })
      .select()
      .single()
  );
}

export async function updateExam(id, fields) {
  const validated = validate(examSchema, fields);
  return unwrap(
    await supabase.from('exams').update(validated).eq('id', id).select().single()
  );
}

export async function deleteExam(id) {
  return unwrap(await supabase.from('exams').delete().eq('id', id));
}

// ─── Sections ────────────────────────────────────────────────

export async function getSections(examId) {
  return unwrap(await supabase.rpc('get_sections_with_stats', { p_exam_id: examId }));
}

export async function createSection(examId, fields) {
  const validated = validate(sectionSchema, fields);
  return unwrap(
    await supabase.from('sections')
      .insert({ ...validated, exam_id: examId })
      .select()
      .single()
  );
}

export async function updateSection(id, fields) {
  const validated = validate(sectionSchema, fields);
  return unwrap(
    await supabase.from('sections').update(validated).eq('id', id).select().single()
  );
}

export async function deleteSection(id) {
  return unwrap(await supabase.from('sections').delete().eq('id', id));
}

// ─── Terms ───────────────────────────────────────────────────

export async function getTerms(sectionId) {
  return unwrap(
    await supabase.from('terms')
      .select('*')
      .eq('section_id', sectionId)
      .order('id')
  );
}

export async function createTerm(fields) {
  const { section_id } = fields;
  const validated = validate(termSchema, fields);
  return unwrap(
    await supabase.from('terms').insert({ ...validated, section_id }).select().single()
  );
}

export async function bulkImportTerms({ section_id, terms }) {
  const rows = terms
    .filter(t => t.term && t.term.trim())
    .map(t => ({ section_id, term: t.term.trim(), definition: (t.definition || '').trim(), notes: t.notes || '' }));
  if (rows.length === 0) throw new Error('No valid terms to import');
  return unwrap(await supabase.from('terms').insert(rows).select());
}

export async function updateTerm(id, fields) {
  const validated = validate(termSchema, fields);
  return unwrap(
    await supabase.from('terms')
      .update({ ...validated, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  );
}

export async function deleteTerm(id) {
  // Delete associated image from storage if exists
  const { data: term } = await supabase.from('terms').select('image_url').eq('id', id).single();
  if (term?.image_url) {
    const path = term.image_url.split('/term-images/')[1];
    if (path) await supabase.storage.from('term-images').remove([path]);
  }
  return unwrap(await supabase.from('terms').delete().eq('id', id));
}

export async function uploadTermImage(termId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  const ext = file.name.split('.').pop().toLowerCase();
  const filePath = `${user.id}/${termId}_${Date.now()}.${ext}`;

  // Delete old image if exists
  const { data: term } = await supabase.from('terms').select('image_url').eq('id', termId).single();
  if (term?.image_url) {
    const oldPath = term.image_url.split('/term-images/')[1];
    if (oldPath) await supabase.storage.from('term-images').remove([oldPath]);
  }

  const { error: uploadError } = await supabase.storage
    .from('term-images')
    .upload(filePath, file, { contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data: { publicUrl } } = supabase.storage
    .from('term-images')
    .getPublicUrl(filePath);

  unwrap(
    await supabase.from('terms')
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', termId)
  );

  return publicUrl;
}

export async function setTermImageFromUrl(termId, imageUrl) {
  // Delete old image from storage if it was uploaded
  const { data: term } = await supabase.from('terms').select('image_url').eq('id', termId).single();
  if (term?.image_url && term.image_url.includes('term-images')) {
    const path = term.image_url.split('/term-images/')[1];
    if (path) await supabase.storage.from('term-images').remove([path]);
  }

  unwrap(
    await supabase.from('terms')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', termId)
  );

  return imageUrl;
}

export async function searchImages(query) {
  const res = await fetch(`/api/images/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Image search failed');
  const data = await res.json();
  return data.images || [];
}

export async function removeTermImage(termId) {
  const { data: term } = await supabase.from('terms').select('image_url').eq('id', termId).single();
  if (term?.image_url) {
    const path = term.image_url.split('/term-images/')[1];
    if (path) await supabase.storage.from('term-images').remove([path]);
  }
  unwrap(
    await supabase.from('terms')
      .update({ image_url: '', updated_at: new Date().toISOString() })
      .eq('id', termId)
  );
}

// ─── Study Progress ──────────────────────────────────────────

export async function getStudyProgress(sectionId) {
  const terms = unwrap(
    await supabase.from('terms')
      .select('id, term, definition, study_progress(*)')
      .eq('section_id', sectionId)
      .order('id')
  );

  const now = new Date().toISOString();
  const counts = { total: 0, mastered: 0, reviewing: 0, learning: 0, unseen: 0, due_count: 0 };

  const enriched = terms.map(t => {
    const sp = t.study_progress?.[0] || null;
    const status = sp?.status || 'unseen';
    const correct_count = sp?.correct_count || 0;
    const incorrect_count = sp?.incorrect_count || 0;
    const next_review = sp?.next_review || null;

    counts.total++;
    counts[status] = (counts[status] || 0) + 1;
    if (next_review && next_review <= now) counts.due_count++;
    if (!next_review && status === 'unseen') counts.due_count++;

    return {
      id: t.id,
      term: t.term,
      definition: t.definition,
      status,
      correct_count,
      incorrect_count,
      next_review,
      ease_factor: sp?.ease_factor ?? null,
      interval: sp?.interval ?? null,
      repetitions: sp?.repetitions ?? null,
    };
  });

  return { ...counts, terms: enriched };
}

// ─── Study Queue ─────────────────────────────────────────────

export async function getStudyQueue(sectionId, mode) {
  const allTerms = unwrap(
    await supabase.from('terms')
      .select('id, term, definition, study_progress(*)')
      .eq('section_id', sectionId)
      .order('id')
  );

  const now = new Date().toISOString();
  let terms;

  if (mode === 'learn') {
    terms = allTerms
      .map(t => {
        const sp = t.study_progress?.[0] || null;
        return {
          id: t.id, term: t.term, definition: t.definition,
          status: sp?.status || 'unseen',
          ease_factor: sp?.ease_factor ?? null,
          interval: sp?.interval ?? null,
          repetitions: sp?.repetitions ?? null,
        };
      })
      .filter(t => t.status === 'unseen' || t.status === 'learning')
      .sort((a, b) => {
        if (a.status === 'unseen' && b.status !== 'unseen') return -1;
        if (a.status !== 'unseen' && b.status === 'unseen') return 1;
        return a.id - b.id;
      })
      .slice(0, 7);
  } else {
    terms = allTerms
      .map(t => {
        const sp = t.study_progress?.[0] || null;
        return {
          id: t.id, term: t.term, definition: t.definition,
          status: sp?.status || 'unseen',
          ease_factor: sp?.ease_factor ?? null,
          interval: sp?.interval ?? null,
          repetitions: sp?.repetitions ?? null,
          next_review: sp?.next_review ?? null,
        };
      })
      .filter(t => !t.next_review || t.next_review <= now)
      .sort((a, b) => {
        if (a.next_review && !b.next_review) return -1;
        if (!a.next_review && b.next_review) return 1;
        if (a.next_review && b.next_review) return a.next_review < b.next_review ? -1 : 1;
        return a.id - b.id;
      })
      .slice(0, 20);
  }

  return { terms, count: terms.length };
}

// ─── Study Test (client-side generation) ─────────────────────

export async function getStudyTest(sectionId, count = 20) {
  const allTerms = unwrap(
    await supabase.from('terms')
      .select('id, term, definition')
      .eq('section_id', sectionId)
  );

  if (allTerms.length < 4) {
    throw new Error('Need at least 4 terms to generate a test');
  }

  const maxCount = Math.min(count, 50, allTerms.length);
  const shuffled = [...allTerms].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, maxCount);

  const questions = selected.map((term, i) => {
    const ratio = i / selected.length;
    let type;
    if (ratio < 0.4) type = 'multiple_choice';
    else if (ratio < 0.7) type = 'written';
    else type = 'true_false';

    if (type === 'multiple_choice') {
      const direction = Math.random() < 0.5 ? 'term_to_def' : 'def_to_term';
      const distractors = allTerms
        .filter(t => t.id !== term.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const prompt = direction === 'term_to_def' ? term.term : term.definition;
      const correctAnswer = direction === 'term_to_def' ? term.definition : term.term;
      const options = [
        correctAnswer,
        ...distractors.map(d => direction === 'term_to_def' ? d.definition : d.term),
      ].sort(() => Math.random() - 0.5);

      return { term_id: term.id, type: 'multiple_choice', direction, prompt, options, correct_answer: correctAnswer };
    }

    if (type === 'written') {
      const direction = Math.random() < 0.5 ? 'term_to_def' : 'def_to_term';
      return {
        term_id: term.id, type: 'written', direction,
        prompt: direction === 'term_to_def' ? term.definition : term.term,
        correct_answer: direction === 'term_to_def' ? term.term : term.definition,
      };
    }

    // true_false
    const isTrue = Math.random() < 0.5;
    let shownDefinition = term.definition;
    if (!isTrue) {
      const others = allTerms.filter(t => t.id !== term.id);
      shownDefinition = others[Math.floor(Math.random() * others.length)].definition;
    }
    return { term_id: term.id, type: 'true_false', prompt: term.term, shown_definition: shownDefinition, correct_answer: isTrue };
  });

  questions.sort(() => Math.random() - 0.5);
  return { questions, count: questions.length };
}

// ─── Study Answer (client-side SM-2) ─────────────────────────

export async function submitAnswer({ term_id, quality }) {
  // Get current progress
  const { data: rows } = await supabase
    .from('study_progress')
    .select('*')
    .eq('term_id', term_id);

  const current = rows?.[0] || { ease_factor: 2.5, interval: 0, repetitions: 0 };
  const result = calculateSR(current, quality);

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + result.interval);

  if (rows && rows.length > 0) {
    // Update existing
    unwrap(
      await supabase.from('study_progress')
        .update({
          ease_factor: result.ease_factor,
          interval: result.interval,
          repetitions: result.repetitions,
          next_review: nextReview.toISOString(),
          last_reviewed: new Date().toISOString(),
          correct_count: current.correct_count + result.correctDelta,
          incorrect_count: current.incorrect_count + result.incorrectDelta,
          status: result.status,
          updated_at: new Date().toISOString(),
        })
        .eq('term_id', term_id)
    );
  } else {
    // Insert new
    unwrap(
      await supabase.from('study_progress')
        .insert({
          term_id,
          ease_factor: result.ease_factor,
          interval: result.interval,
          repetitions: result.repetitions,
          next_review: nextReview.toISOString(),
          last_reviewed: new Date().toISOString(),
          correct_count: result.correctDelta,
          incorrect_count: result.incorrectDelta,
          status: result.status,
        })
    );
  }

  return { success: true, ...result };
}

// ─── Study Reset ─────────────────────────────────────────────

export async function resetStudyProgress({ section_id, term_ids }) {
  if (term_ids && term_ids.length > 0) {
    return unwrap(
      await supabase.from('study_progress').delete().in('term_id', term_ids)
    );
  }
  if (section_id) {
    // Get term IDs for this section, then delete their progress
    const terms = unwrap(
      await supabase.from('terms').select('id').eq('section_id', section_id)
    );
    const ids = terms.map(t => t.id);
    if (ids.length > 0) {
      return unwrap(
        await supabase.from('study_progress').delete().in('term_id', ids)
      );
    }
    return [];
  }
  throw new Error('section_id or term_ids required');
}

// ─── Notes ───────────────────────────────────────────────────

export async function getNotes(sectionId) {
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('section_id', sectionId)
    .maybeSingle();
  return data || { content: '' };
}

export async function saveNotes(sectionId, content) {
  const validated = validate(notesSchema, { content });
  return unwrap(
    await supabase.from('notes')
      .upsert(
        { section_id: sectionId, content: validated.content, updated_at: new Date().toISOString() },
        { onConflict: 'section_id' }
      )
      .select()
      .single()
  );
}

// ─── Textbooks ───────────────────────────────────────────────

export async function getTextbooks(courseId) {
  return unwrap(await supabase.rpc('get_textbooks_with_stats', { p_course_id: courseId }));
}

export async function uploadTextbook(courseId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  const filePath = `${user.id}/${Date.now()}_${file.name}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('textbooks')
    .upload(filePath, file, { contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  // Create textbook record
  const textbook = unwrap(
    await supabase.from('textbooks')
      .insert({
        course_id: courseId,
        title: file.name.replace(/\.(pdf|epub)$/i, ''),
        filename: filePath,
        type: file.name.endsWith('.epub') ? 'epub' : 'pdf',
      })
      .select()
      .single()
  );

  // Call serverless function to process
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/textbooks/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ filePath, textbookId: textbook.id, courseId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Processing failed' }));
    throw new Error(err.error || 'Processing failed');
  }

  return res.json();
}

export async function pasteTextbook(courseId, { title, content }) {
  validate(textbookPasteSchema, { title, content });
  // Create textbook record
  const textbook = unwrap(
    await supabase.from('textbooks')
      .insert({ course_id: courseId, title, type: 'paste' })
      .select()
      .single()
  );

  // Create single chapter
  unwrap(
    await supabase.from('textbook_chapters')
      .insert({
        textbook_id: textbook.id,
        chapter_number: 1,
        title,
        content,
      })
  );

  return { id: textbook.id, chapter_count: 1 };
}

export async function deleteTextbook(id) {
  // Get filename to delete from storage
  const { data: tb } = await supabase.from('textbooks').select('filename').eq('id', id).single();
  if (tb?.filename) {
    await supabase.storage.from('textbooks').remove([tb.filename]);
  }
  return unwrap(await supabase.from('textbooks').delete().eq('id', id));
}

export async function getTextbookChapters(id) {
  return unwrap(
    await supabase.from('textbook_chapters')
      .select('id, chapter_number, title')
      .eq('textbook_id', id)
      .order('chapter_number')
  );
}

export async function getChapterContent(chapterId) {
  return unwrap(
    await supabase.from('textbook_chapters')
      .select('id, chapter_number, title, content')
      .eq('id', chapterId)
      .single()
  );
}

export async function searchTextbook(id, query) {
  return unwrap(
    await supabase.rpc('search_textbook_chapters', {
      textbook_id_input: id,
      query,
    })
  );
}

// ─── Textbook Links ──────────────────────────────────────────

export async function getSectionLinks(sectionId) {
  return unwrap(
    await supabase.rpc('get_section_links', { p_section_id: sectionId })
  );
}

export async function createSectionLink(sectionId, fields) {
  return unwrap(
    await supabase.from('section_textbook_links')
      .insert({ section_id: sectionId, ...fields })
      .select()
      .single()
  );
}

export async function deleteSectionLink(id) {
  return unwrap(
    await supabase.from('section_textbook_links').delete().eq('id', id)
  );
}

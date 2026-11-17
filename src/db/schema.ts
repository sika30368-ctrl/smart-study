import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  photoUrl: text('photo_url').notNull().default(''),
  role: text('role').notNull().default('student'), // 'student' | 'admin'
  gradeCode: text('grade_code').notNull().default('sec3'),
  track: text('track').notNull().default('scientific_science'), // 'general' | 'scientific_science' | 'scientific_math' | 'literary'
  academicYear: text('academic_year').notNull().default('2025-2026'),
  preferredLang: text('preferred_lang').notNull().default('ar'), // 'ar' | 'en'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const academicYears = pgTable('academic_years', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g., '2025-2026'
  labelAr: text('label_ar').notNull(),
  labelEn: text('label_en').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const grades = pgTable('grades', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // prep1, prep2, prep3, sec1, sec2, sec3
  stage: text('stage').notNull(), // 'preparatory' | 'secondary'
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  shortAr: text('short_ar').notNull(),
  shortEn: text('short_en').notNull(),
  orderIndex: integer('order_index').notNull(),
});

export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(), // e.g. 'prep1-science', 'sec3-physics'
  gradeCode: text('grade_code').notNull(),
  nameAr: text('name_ar').notNull(),
  nameEn: text('name_en').notNull(),
  track: text('track').notNull().default('all'), // 'all' | 'scientific' | 'scientific_science' | 'scientific_math' | 'literary'
  languageTrack: text('language_track').notNull().default('arabic_and_english'), // 'arabic_and_english' | 'arabic_only' | 'english_only'
  academicYear: text('academic_year').notNull().default('2025-2026'),
  descriptionAr: text('description_ar').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  officialBookUrlAr: text('official_book_url_ar').notNull().default('https://studentbooks.moe.gov.eg/'),
  officialBookUrlEn: text('official_book_url_en'),
  iconKey: text('icon_key').notNull().default('book'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const units = pgTable('units', {
  id: serial('id').primaryKey(),
  subjectId: integer('subject_id')
    .references(() => subjects.id, { onDelete: 'cascade' })
    .notNull(),
  semester: integer('semester').notNull().default(1), // 1 or 2
  orderIndex: integer('order_index').notNull().default(1),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  descriptionAr: text('description_ar').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
});

export const lessons = pgTable('lessons', {
  id: serial('id').primaryKey(),
  unitId: integer('unit_id')
    .references(() => units.id, { onDelete: 'cascade' })
    .notNull(),
  chapterAr: text('chapter_ar').notNull().default(''),
  chapterEn: text('chapter_en').notNull().default(''),
  orderIndex: integer('order_index').notNull().default(1),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  contentAr: text('content_ar').notNull(),
  contentEn: text('content_en'), // NULL when official Ministry English edition does not exist
  isOfficialEn: boolean('is_official_en').notNull().default(false),
  learningObjectivesAr: jsonb('learning_objectives_ar').$type<string[]>().notNull().default([]),
  learningObjectivesEn: jsonb('learning_objectives_en').$type<string[]>().notNull().default([]),
  keyDefinitionsAr: jsonb('key_definitions_ar').$type<{ term: string; definition: string }[]>().notNull().default([]),
  keyDefinitionsEn: jsonb('key_definitions_en').$type<{ term: string; definition: string }[]>().notNull().default([]),
  formulasRules: jsonb('formulas_rules').$type<{ labelAr: string; labelEn: string; expression: string; noteAr?: string; noteEn?: string }[]>().notNull().default([]),
  exercisesAr: jsonb('exercises_ar').$type<{ question: string; hint?: string; answer: string }[]>().notNull().default([]),
  exercisesEn: jsonb('exercises_en').$type<{ question: string; hint?: string; answer: string }[]>().notNull().default([]),
  revisionNotesAr: text('revision_notes_ar').notNull().default(''),
  revisionNotesEn: text('revision_notes_en'),
  officialSourceUrl: text('official_source_url').notNull().default('https://studentbooks.moe.gov.eg/'),
  sourceVerified: boolean('source_verified').notNull().default(true),
  publishedDate: text('published_date').notNull().default('2025-09-15'),
  versionNumber: integer('version_number').notNull().default(1),
  embeddingJson: text('embedding_json'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const curriculumVersions = pgTable('curriculum_versions', {
  id: serial('id').primaryKey(),
  subjectId: integer('subject_id')
    .references(() => subjects.id, { onDelete: 'cascade' })
    .notNull(),
  versionLabel: text('version_label').notNull(),
  academicYear: text('academic_year').notNull().default('2025-2026'),
  sourceUrl: text('source_url').notNull().default(''),
  documentTitle: text('document_title').notNull(),
  localFilePath: text('local_file_path'),
  extractedText: text('extracted_text').notNull().default(''),
  diffSummaryAr: text('diff_summary_ar').notNull().default(''),
  diffSummaryEn: text('diff_summary_en').notNull().default(''),
  changeReportJson: jsonb('change_report_json').$type<{
    addedTopics: string[];
    modifiedLessons: string[];
    removedChapters: string[];
    extractedLessonsPreview: {
      unitTitleAr: string;
      titleAr: string;
      titleEn: string;
      summaryAr: string;
      objectivesAr: string[];
    }[];
  }>(),
  status: text('status').notNull().default('pending_review'), // 'pending_review' | 'approved' | 'rejected' | 'archived'
  uploadedByUid: text('uploaded_by_uid').notNull().default('system'),
  approvedByUid: text('approved_by_uid'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ministryAssessments = pgTable('ministry_assessments', {
  id: serial('id').primaryKey(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en').notNull(),
  gradeCode: text('grade_code').notNull(),
  subjectCode: text('subject_code').notNull(),
  academicYear: text('academic_year').notNull().default('2025-2026'),
  semester: integer('semester').notNull().default(1),
  periodLabelAr: text('period_label_ar').notNull().default('الأسبوع الأول'),
  periodLabelEn: text('period_label_en').notNull().default('Week 1'),
  assessmentType: text('assessment_type').notNull().default('weekly'), // 'weekly' | 'monthly' | 'general' | 'model_exam' | 'revision' | 'question_bank'
  officialSourceUrl: text('official_source_url').notNull(),
  sourceDomain: text('source_domain').notNull().default('studentbooks.moe.gov.eg'),
  isOfficialVerified: boolean('is_official_verified').notNull().default(true),
  localFilePath: text('local_file_path'),
  publicationDate: text('publication_date').notNull().default('2025-10-01'),
  descriptionAr: text('description_ar').notNull().default(''),
  descriptionEn: text('description_en').notNull().default(''),
  practiceQuestionsJson: jsonb('practice_questions_json').$type<{
    id: string;
    type: 'mcq' | 'true_false' | 'written';
    questionAr: string;
    questionEn: string;
    optionsAr?: string[];
    optionsEn?: string[];
    correctAnswerAr: string;
    correctAnswerEn: string;
    explanationAr: string;
    explanationEn: string;
  }[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ministryMonitorLogs = pgTable('ministry_monitor_logs', {
  id: serial('id').primaryKey(),
  targetUrl: text('target_url').notNull(),
  status: text('status').notNull(), // 'success' | 'blocked_robots' | 'unreachable' | 'changes_detected'
  discoveredCount: integer('discovered_count').notNull().default(0),
  discoveredResourcesJson: jsonb('discovered_resources_json').$type<{
    title: string;
    url: string;
    type: string;
    gradeHint?: string;
    discoveredVia: string;
  }[]>().notNull().default([]),
  notes: text('notes').notNull().default(''),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
});

export const studentProgress = pgTable('student_progress', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  lessonId: integer('lesson_id')
    .references(() => lessons.id, { onDelete: 'cascade' })
    .notNull(),
  completed: boolean('completed').notNull().default(false),
  masteryScore: integer('mastery_score').notNull().default(0),
  lastStudiedAt: timestamp('last_studied_at').defaultNow().notNull(),
});

export const savedSummaries = pgTable('saved_summaries', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  lessonId: integer('lesson_id')
    .references(() => lessons.id, { onDelete: 'cascade' })
    .notNull(),
  summaryType: text('summary_type').notNull(),
  language: text('language').notNull().default('ar'),
  contentMarkdown: text('content_markdown').notNull(),
  citationsJson: jsonb('citations_json').$type<{ title: string; sourceUrl: string; type: string }[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const aiConversations = pgTable('ai_conversations', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  mode: text('mode').notNull().default('tutor'), // 'tutor' | 'problem_solver'
  gradeCode: text('grade_code').notNull().default('sec3'),
  subjectCode: text('subject_code').notNull().default(''),
  lessonId: integer('lesson_id'),
  title: text('title').notNull(),
  messagesJson: jsonb('messages_json').$type<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    citations?: { lessonId: number; titleAr: string; titleEn: string; sourceUrl: string }[];
  }[]>().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const practiceExams = pgTable('practice_exams', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  gradeCode: text('grade_code').notNull(),
  subjectCode: text('subject_code').notNull(),
  semester: integer('semester').notNull().default(1),
  unitTitle: text('unit_title').notNull().default(''),
  lessonTitle: text('lesson_title').notNull().default(''),
  difficulty: text('difficulty').notNull().default('medium'),
  language: text('language').notNull().default('ar'),
  questionsJson: jsonb('questions_json').$type<{
    id: string;
    type: 'mcq' | 'true_false' | 'complete' | 'written' | 'math_problem';
    prompt: string;
    options?: string[];
    points: number;
  }[]>().notNull().default([]),
  answerKeyJson: jsonb('answer_key_json').$type<{
    id: string;
    correctAnswer: string;
    explanation: string;
    curriculumReference: string;
  }[]>().notNull().default([]),
  studentAnswersJson: jsonb('student_answers_json').$type<Record<string, string>>().notNull().default({}),
  score: integer('score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: serial('id').primaryKey(),
  actorUid: text('actor_uid').notNull(),
  actorEmail: text('actor_email').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull().default(''),
  detailsJson: jsonb('details_json').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const subjectsRelations = relations(subjects, ({ many }) => ({
  units: many(units),
  versions: many(curriculumVersions),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [units.subjectId],
    references: [subjects.id],
  }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  unit: one(units, {
    fields: [lessons.unitId],
    references: [units.id],
  }),
  progressRecords: many(studentProgress),
  savedSummaries: many(savedSummaries),
}));

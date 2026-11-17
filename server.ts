import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  academicYears,
  adminAuditLogs,
  aiConversations,
  curriculumVersions,
  grades,
  lessons,
  ministryAssessments,
  ministryMonitorLogs,
  practiceExams,
  savedSummaries,
  studentProgress,
  subjects,
  units,
  users,
} from './src/db/schema.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { AuthRequest, optionalAuth, requireAdmin, requireAuth } from './src/middleware/auth.ts';
import {
  analyzeCurriculumDiffAndExtract,
  generateAiLessonTranslation,
  generateLessonSummary,
  generatePracticeExam,
  ocrPdfOrImageWithGemini,
  retrieveCurriculumContext,
  runAiStudyTutor,
  solveStudentProblem,
} from './server/aiService.ts';
import { isVerifiedMoeUrl, runMoePortalDiscovery } from './server/moeService.ts';

const PORT = 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const pdfStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  },
});

const uploadPdf = multer({
  storage: pdfStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF or plain text educational documents are permitted.'));
    }
  },
});

const uploadHomeworkImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPEG, WEBP) are allowed for homework photo uploads.'));
    }
  },
});

async function extractTextFromPdfBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }
  try {
    const pdfParseModule: any = await import('pdf-parse');
    const pdfParse = pdfParseModule.default ?? pdfParseModule;
    if (typeof pdfParse === 'function') {
      const parsed = await pdfParse(buffer);
      if (parsed?.text && parsed.text.trim().length >= 80) {
        return parsed.text.trim();
      }
    }
  } catch (err) {
    console.warn('pdf-parse extraction fallback to Gemini OCR:', err);
  }
  // OCR fallback via Gemini multimodal for scanned Arabic/English PDFs
  return await ocrPdfOrImageWithGemini(buffer, 'application/pdf');
}

async function logAdminAction(
  req: AuthRequest,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {}
) {
  if (!req.dbUser) return;
  try {
    await db.insert(adminAuditLogs).values({
      actorUid: req.dbUser.uid,
      actorEmail: req.dbUser.email,
      action,
      targetType,
      targetId,
      detailsJson: details,
    });
  } catch (err) {
    console.error('Failed to record admin audit log:', err);
  }
}

async function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  // Rate limiting for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again shortly.' },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI rate limit reached. Please wait a moment before sending another request.' },
  });

  app.use('/api', apiLimiter);
  app.use('/api/ai', aiLimiter);

  // Serve locally uploaded official PDFs safely
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Ensure initial Egyptian curriculum & official Ministry portals are seeded on first API hit
  app.use('/api', async (_req, res, next) => {
    try {
      await ensureSeeded();
      next();
    } catch (error: any) {
      console.error('Seed middleware error:', error);
      res.status(503).json({ error: error.message || 'Database is initializing. Please retry.' });
    }
  });

  // ==================== BOOTSTRAP & AUTH PROFILE ====================
  app.get('/api/bootstrap', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const [allGrades, allYears, allSubjects] = await Promise.all([
        db.select().from(grades).orderBy(grades.orderIndex),
        db.select().from(academicYears).orderBy(desc(academicYears.isActive), academicYears.code),
        db.select().from(subjects).orderBy(subjects.gradeCode, subjects.nameEn),
      ]);

      res.json({
        grades: allGrades,
        academicYears: allYears,
        subjectsCount: allSubjects.length,
        user: req.dbUser ?? null,
      });
    } catch (error: any) {
      console.error('Bootstrap error:', error);
      res.status(500).json({ error: 'Failed to load platform metadata.' });
    }
  });

  app.put('/api/student/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { gradeCode, track, academicYear, preferredLang } = req.body;
      const updated = await db
        .update(users)
        .set({
          gradeCode: gradeCode ?? req.dbUser!.gradeCode,
          track: track ?? req.dbUser!.track,
          academicYear: academicYear ?? req.dbUser!.academicYear,
          preferredLang: preferredLang ?? req.dbUser!.preferredLang,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, req.dbUser!.uid))
        .returning();
      res.json({ user: updated[0] });
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Failed to update student preferences.' });
    }
  });

  // ==================== CURRICULUM CATALOG & LOCAL SYNC ====================
  app.get('/api/curriculum/subjects', async (req, res) => {
    try {
      const gradeCode = typeof req.query.grade === 'string' ? req.query.grade : undefined;
      const track = typeof req.query.track === 'string' ? req.query.track : undefined;
      const academicYear = typeof req.query.year === 'string' ? req.query.year : undefined;

      const allSubjects = await db.select().from(subjects).orderBy(subjects.id);
      const allUnits = await db.select().from(units).orderBy(units.semester, units.orderIndex);
      const allLessons = await db
        .select({
          id: lessons.id,
          unitId: lessons.unitId,
          titleAr: lessons.titleAr,
          titleEn: lessons.titleEn,
          isOfficialEn: lessons.isOfficialEn,
        })
        .from(lessons);

      const filtered = allSubjects.filter((s) => {
        if (gradeCode && s.gradeCode !== gradeCode) return false;
        if (academicYear && s.academicYear !== academicYear) return false;
        if (track && track !== 'all' && track !== 'general') {
          if (s.track !== 'all') {
            if (track === 'scientific_science' && !['scientific', 'scientific_science'].includes(s.track)) return false;
            if (track === 'scientific_math' && !['scientific', 'scientific_math'].includes(s.track)) return false;
            if (track === 'literary' && s.track !== 'literary') return false;
          }
        }
        return true;
      });

      const enriched = filtered.map((s) => {
        const subjUnits = allUnits.filter((u) => u.subjectId === s.id);
        const unitIds = new Set(subjUnits.map((u) => u.id));
        const subjLessons = allLessons.filter((l) => unitIds.has(l.unitId));
        return {
          ...s,
          unitsCount: subjUnits.length,
          lessonsCount: subjLessons.length,
          semesters: Array.from(new Set(subjUnits.map((u) => u.semester))).sort(),
        };
      });

      res.json({ subjects: enriched });
    } catch (error: any) {
      console.error('List subjects error:', error);
      res.status(500).json({ error: 'Failed to retrieve curriculum subjects.' });
    }
  });

  // Full offline/local snapshot endpoint for client-side caching & synchronization
  app.get('/api/curriculum/snapshot', async (req, res) => {
    try {
      const gradeCode = typeof req.query.grade === 'string' ? req.query.grade : undefined;
      const allSubjects = await db.select().from(subjects);
      const targetSubjects = gradeCode
        ? allSubjects.filter((s) => s.gradeCode === gradeCode)
        : allSubjects;
      const subjectIds = new Set(targetSubjects.map((s) => s.id));
      const allUnits = (await db.select().from(units)).filter((u) => subjectIds.has(u.subjectId));
      const unitIds = new Set(allUnits.map((u) => u.id));
      const allLessons = (await db.select().from(lessons)).filter((l) => unitIds.has(l.unitId));

      res.json({
        syncedAt: new Date().toISOString(),
        gradeCode: gradeCode ?? 'all',
        subjects: targetSubjects,
        units: allUnits,
        lessons: allLessons.map(({ embeddingJson: _ignored, ...rest }) => rest),
      });
    } catch (error: any) {
      console.error('Curriculum snapshot error:', error);
      res.status(500).json({ error: 'Failed to export curriculum snapshot.' });
    }
  });

  app.get('/api/curriculum/subjects/:code', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const code = req.params.code;
      const subjRows = await db.select().from(subjects).where(eq(subjects.code, code)).limit(1);
      if (subjRows.length === 0) {
        return res.status(404).json({ error: 'Subject not found.' });
      }
      const subject = subjRows[0];
      const subjUnits = await db
        .select()
        .from(units)
        .where(eq(units.subjectId, subject.id))
        .orderBy(units.semester, units.orderIndex);

      const allLessons = await db.select().from(lessons).orderBy(lessons.orderIndex);
      const subjAssessments = await db
        .select()
        .from(ministryAssessments)
        .where(eq(ministryAssessments.subjectCode, subject.code))
        .orderBy(desc(ministryAssessments.publicationDate));

      const versions = await db
        .select()
        .from(curriculumVersions)
        .where(eq(curriculumVersions.subjectId, subject.id))
        .orderBy(desc(curriculumVersions.createdAt));

      let completedSet = new Set<number>();
      if (req.dbUser) {
        const prog = await db
          .select()
          .from(studentProgress)
          .where(and(eq(studentProgress.userUid, req.dbUser.uid), eq(studentProgress.completed, true)));
        completedSet = new Set(prog.map((p) => p.lessonId));
      }

      const unitsWithLessons = subjUnits.map((u) => ({
        ...u,
        lessons: allLessons
          .filter((l) => l.unitId === u.id)
          .map(({ embeddingJson: _emb, ...l }) => ({
            ...l,
            completed: completedSet.has(l.id),
          })),
      }));

      res.json({
        subject,
        units: unitsWithLessons,
        assessments: subjAssessments,
        versions,
      });
    } catch (error: any) {
      console.error('Subject detail error:', error);
      res.status(500).json({ error: 'Failed to load subject details.' });
    }
  });

  app.get('/api/curriculum/lessons/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const lessonId = Number(req.params.id);
      if (Number.isNaN(lessonId)) return res.status(400).json({ error: 'Invalid lesson ID.' });

      const rows = await db
        .select({ lesson: lessons, unit: units, subject: subjects })
        .from(lessons)
        .innerJoin(units, eq(lessons.unitId, units.id))
        .innerJoin(subjects, eq(units.subjectId, subjects.id))
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (rows.length === 0) return res.status(404).json({ error: 'Lesson not found.' });

      const { lesson, unit, subject } = rows[0];
      const { embeddingJson: _emb, ...safeLesson } = lesson;

      let progress = null;
      let lessonSummaries: typeof savedSummaries.$inferSelect[] = [];
      if (req.dbUser) {
        const progRows = await db
          .select()
          .from(studentProgress)
          .where(and(eq(studentProgress.userUid, req.dbUser.uid), eq(studentProgress.lessonId, lessonId)))
          .limit(1);
        progress = progRows[0] ?? null;

        lessonSummaries = await db
          .select()
          .from(savedSummaries)
          .where(and(eq(savedSummaries.userUid, req.dbUser.uid), eq(savedSummaries.lessonId, lessonId)))
          .orderBy(desc(savedSummaries.createdAt));
      }

      res.json({
        lesson: safeLesson,
        unit,
        subject,
        progress,
        savedSummaries: lessonSummaries,
      });
    } catch (error: any) {
      console.error('Lesson detail error:', error);
      res.status(500).json({ error: 'Failed to load lesson.' });
    }
  });

  // ==================== BILINGUAL CURRICULUM SEARCH ENGINE ====================
  app.get('/api/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const gradeCode = typeof req.query.grade === 'string' && req.query.grade !== 'all' ? req.query.grade : undefined;
      const subjectCode = typeof req.query.subject === 'string' && req.query.subject !== 'all' ? req.query.subject : undefined;
      const semester = req.query.semester && req.query.semester !== 'all' ? Number(req.query.semester) : undefined;
      const academicYear = typeof req.query.year === 'string' && req.query.year !== 'all' ? req.query.year : undefined;

      const allLessonRows = await db
        .select({ lesson: lessons, unit: units, subject: subjects })
        .from(lessons)
        .innerJoin(units, eq(lessons.unitId, units.id))
        .innerJoin(subjects, eq(units.subjectId, subjects.id));

      const allAssessments = await db.select().from(ministryAssessments);
      const qLower = q.toLowerCase();

      const matchedLessons = allLessonRows
        .filter((row) => {
          if (gradeCode && row.subject.gradeCode !== gradeCode) return false;
          if (subjectCode && row.subject.code !== subjectCode) return false;
          if (semester && row.unit.semester !== semester) return false;
          if (academicYear && row.subject.academicYear !== academicYear) return false;
          if (!qLower) return true;
          const haystack = [
            row.lesson.titleAr,
            row.lesson.titleEn,
            row.lesson.contentAr,
            row.lesson.contentEn ?? '',
            row.unit.titleAr,
            row.unit.titleEn,
            row.subject.nameAr,
            row.subject.nameEn,
            JSON.stringify(row.lesson.keyDefinitionsAr),
            JSON.stringify(row.lesson.keyDefinitionsEn),
            JSON.stringify(row.lesson.formulasRules),
            row.lesson.revisionNotesAr,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(qLower);
        })
        .map((row) => ({
          id: row.lesson.id,
          titleAr: row.lesson.titleAr,
          titleEn: row.lesson.titleEn,
          chapterAr: row.lesson.chapterAr,
          chapterEn: row.lesson.chapterEn,
          unitTitleAr: row.unit.titleAr,
          unitTitleEn: row.unit.titleEn,
          semester: row.unit.semester,
          subjectCode: row.subject.code,
          subjectNameAr: row.subject.nameAr,
          subjectNameEn: row.subject.nameEn,
          gradeCode: row.subject.gradeCode,
          isOfficialEn: row.lesson.isOfficialEn,
          snippetAr: row.lesson.contentAr.slice(0, 180) + '...',
          snippetEn: row.lesson.contentEn ? row.lesson.contentEn.slice(0, 180) + '...' : null,
          formulasCount: (row.lesson.formulasRules ?? []).length,
          definitionsCount: (row.lesson.keyDefinitionsAr ?? []).length,
        }));

      const matchedAssessments = allAssessments.filter((a) => {
        if (gradeCode && a.gradeCode !== gradeCode) return false;
        if (subjectCode && a.subjectCode !== subjectCode) return false;
        if (semester && a.semester !== semester) return false;
        if (academicYear && a.academicYear !== academicYear) return false;
        if (!qLower) return true;
        const hay = `${a.titleAr} ${a.titleEn} ${a.periodLabelAr} ${a.periodLabelEn} ${a.descriptionAr} ${a.descriptionEn}`.toLowerCase();
        return hay.includes(qLower);
      });

      res.json({
        query: q,
        lessons: matchedLessons,
        assessments: matchedAssessments,
      });
    } catch (error: any) {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Search failed.' });
    }
  });

  // ==================== OFFICIAL MINISTRY ASSESSMENTS ====================
  app.get('/api/assessments', async (req, res) => {
    try {
      const gradeCode = typeof req.query.grade === 'string' && req.query.grade !== 'all' ? req.query.grade : undefined;
      const subjectCode = typeof req.query.subject === 'string' && req.query.subject !== 'all' ? req.query.subject : undefined;
      const semester = req.query.semester && req.query.semester !== 'all' ? Number(req.query.semester) : undefined;
      const type = typeof req.query.type === 'string' && req.query.type !== 'all' ? req.query.type : undefined;
      const academicYear = typeof req.query.year === 'string' && req.query.year !== 'all' ? req.query.year : undefined;

      const all = await db
        .select()
        .from(ministryAssessments)
        .orderBy(desc(ministryAssessments.publicationDate));

      const filtered = all.filter((a) => {
        if (gradeCode && a.gradeCode !== gradeCode) return false;
        if (subjectCode && a.subjectCode !== subjectCode) return false;
        if (semester && a.semester !== semester) return false;
        if (type && a.assessmentType !== type) return false;
        if (academicYear && a.academicYear !== academicYear) return false;
        return true;
      });

      res.json({ assessments: filtered });
    } catch (error: any) {
      console.error('Assessments list error:', error);
      res.status(500).json({ error: 'Failed to load official Ministry assessments.' });
    }
  });

  // Generate an expanded interactive practice version (MCQ, T/F, Fill-in-blank, Written) of an Official Ministry Assessment
  app.post('/api/assessments/:id/practice-version', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { language = 'ar', difficulty = 'medium', questionCount = 6 } = req.body;
      const rows = await db.select().from(ministryAssessments).where(eq(ministryAssessments.id, id)).limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Assessment not found.' });
      const assessment = rows[0];

      const generated = await generatePracticeExam({
        gradeCode: assessment.gradeCode,
        subjectCode: assessment.subjectCode,
        semester: assessment.semester,
        lessonTitle: language === 'ar' ? assessment.titleAr : assessment.titleEn,
        difficulty,
        questionCount,
        questionTypes: ['mcq', 'true_false', 'complete', 'written'],
        language,
        assessmentContextText: `${assessment.titleAr} / ${assessment.titleEn}\n${assessment.descriptionAr}\n${assessment.descriptionEn}`,
      });

      let savedId: number | null = null;
      if (req.dbUser) {
        const inserted = await db
          .insert(practiceExams)
          .values({
            userUid: req.dbUser.uid,
            gradeCode: assessment.gradeCode,
            subjectCode: assessment.subjectCode,
            semester: assessment.semester,
            unitTitle: language === 'ar' ? assessment.periodLabelAr : assessment.periodLabelEn,
            lessonTitle: language === 'ar' ? assessment.titleAr : assessment.titleEn,
            difficulty,
            language,
            questionsJson: generated.questions ?? [],
            answerKeyJson: generated.answerKey ?? [],
          })
          .returning();
        savedId = inserted[0].id;
      }

      res.json({
        examId: savedId,
        isPracticeSimulation: true,
        basedOnOfficialAssessment: {
          id: assessment.id,
          titleAr: assessment.titleAr,
          titleEn: assessment.titleEn,
          officialSourceUrl: assessment.officialSourceUrl,
        },
        ...generated,
      });
    } catch (error: any) {
      console.error('Assessment practice version error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to generate interactive practice assessment.' });
    }
  });

  // ==================== REAL AI ASSISTANT (RAG, SUMMARIZER, SOLVER, TUTOR, EXAM GEN) ====================
  app.post('/api/ai/summarize', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const { lessonId, summaryType = 'short', language = 'ar', save = true } = req.body;
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required.' });

      const result = await generateLessonSummary({
        lessonId: Number(lessonId),
        summaryType,
        language,
      });

      let savedRecord = null;
      if (save && req.dbUser) {
        const inserted = await db
          .insert(savedSummaries)
          .values({
            userUid: req.dbUser.uid,
            lessonId: Number(lessonId),
            summaryType,
            language,
            contentMarkdown: result.contentMarkdown,
            citationsJson: result.citations,
          })
          .returning();
        savedRecord = inserted[0];
      }

      res.json({ ...result, savedSummary: savedRecord });
    } catch (error: any) {
      console.error('AI summarize error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to generate lesson summary.' });
    }
  });

  app.post('/api/ai/translate-lesson', async (req, res) => {
    try {
      const { lessonId } = req.body;
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required.' });
      const result = await generateAiLessonTranslation(Number(lessonId));
      res.json(result);
    } catch (error: any) {
      console.error('AI translate error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to translate lesson.' });
    }
  });

  app.post('/api/ai/solve', optionalAuth, uploadHomeworkImage.single('image'), async (req: AuthRequest, res) => {
    try {
      const questionText = typeof req.body.questionText === 'string' ? req.body.questionText : '';
      const gradeCode = typeof req.body.gradeCode === 'string' ? req.body.gradeCode : 'sec3';
      const subjectCode = typeof req.body.subjectCode === 'string' ? req.body.subjectCode : undefined;
      const language = req.body.language === 'en' ? 'en' : 'ar';

      if (!questionText.trim() && !req.file) {
        return res.status(400).json({ error: 'Please type a problem or upload an exercise image.' });
      }

      const result = await solveStudentProblem({
        questionText,
        gradeCode,
        subjectCode,
        language,
        imageBase64: req.file ? req.file.buffer.toString('base64') : undefined,
        imageMimeType: req.file ? req.file.mimetype : undefined,
      });

      if (req.dbUser) {
        await db.insert(aiConversations).values({
          userUid: req.dbUser.uid,
          mode: 'problem_solver',
          gradeCode,
          subjectCode: subjectCode ?? '',
          title: (questionText || 'Homework Image Problem').slice(0, 70),
          messagesJson: [
            {
              role: 'user',
              content: questionText || '[Uploaded Homework Image]',
              timestamp: new Date().toISOString(),
            },
            {
              role: 'assistant',
              content: `**${result.solution.topicIdentified}**\n\nFinal Answer: ${result.solution.finalAnswer}`,
              timestamp: new Date().toISOString(),
              citations: result.citations,
            },
          ],
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error('AI problem solver error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to solve problem.' });
    }
  });

  app.post('/api/ai/tutor', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const {
        conversationId,
        message,
        history = [],
        gradeCode = 'sec3',
        subjectCode = '',
        lessonId,
        language = 'ar',
      } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message text is required.' });
      }

      const result = await runAiStudyTutor({
        message,
        history,
        gradeCode,
        subjectCode: subjectCode || undefined,
        lessonId: lessonId ? Number(lessonId) : undefined,
        language,
      });

      let savedConversationId = conversationId ? Number(conversationId) : null;
      if (req.dbUser) {
        const now = new Date().toISOString();
        const newMessages = [
          ...history.map((h: any) => ({ ...h, timestamp: h.timestamp ?? now })),
          { role: 'user' as const, content: message, timestamp: now },
          { role: 'assistant' as const, content: result.reply, timestamp: now, citations: result.citations },
        ];

        if (savedConversationId) {
          await db
            .update(aiConversations)
            .set({ messagesJson: newMessages, updatedAt: new Date() })
            .where(and(eq(aiConversations.id, savedConversationId), eq(aiConversations.userUid, req.dbUser.uid)));
        } else {
          const inserted = await db
            .insert(aiConversations)
            .values({
              userUid: req.dbUser.uid,
              mode: 'tutor',
              gradeCode,
              subjectCode: subjectCode || '',
              lessonId: lessonId ? Number(lessonId) : null,
              title: message.slice(0, 70),
              messagesJson: newMessages,
            })
            .returning();
          savedConversationId = inserted[0].id;
        }
      }

      res.json({ ...result, conversationId: savedConversationId });
    } catch (error: any) {
      console.error('AI tutor error:', error);
      res.status(error.status || 500).json({ error: error.message || 'AI Tutor failed to respond.' });
    }
  });

  app.post('/api/ai/exam-generate', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const {
        gradeCode = 'sec3',
        subjectCode = 'sec3-physics',
        semester = 1,
        unitTitle = '',
        lessonId,
        lessonTitle = '',
        difficulty = 'medium',
        questionCount = 5,
        questionTypes = ['mcq', 'true_false', 'complete', 'written'],
        language = 'ar',
      } = req.body;

      const generated = await generatePracticeExam({
        gradeCode,
        subjectCode,
        semester: Number(semester),
        unitTitle,
        lessonId: lessonId ? Number(lessonId) : undefined,
        lessonTitle,
        difficulty,
        questionCount: Number(questionCount),
        questionTypes,
        language,
      });

      let savedExamId: number | null = null;
      if (req.dbUser) {
        const inserted = await db
          .insert(practiceExams)
          .values({
            userUid: req.dbUser.uid,
            gradeCode,
            subjectCode,
            semester: Number(semester),
            unitTitle,
            lessonTitle: lessonTitle || generated.examTitle || subjectCode,
            difficulty,
            language,
            questionsJson: generated.questions ?? [],
            answerKeyJson: generated.answerKey ?? [],
          })
          .returning();
        savedExamId = inserted[0].id;
      }

      res.json({ examId: savedExamId, isPracticeSimulation: true, ...generated });
    } catch (error: any) {
      console.error('AI exam generation error:', error);
      res.status(error.status || 500).json({ error: error.message || 'Failed to generate practice exam.' });
    }
  });

  app.post('/api/ai/exam/:id/submit', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { answers = {}, score } = req.body;
      const updated = await db
        .update(practiceExams)
        .set({
          studentAnswersJson: answers,
          score: typeof score === 'number' ? score : null,
        })
        .where(and(eq(practiceExams.id, id), eq(practiceExams.userUid, req.dbUser!.uid)))
        .returning();

      res.json({ exam: updated[0] ?? null });
    } catch (error: any) {
      console.error('Submit practice exam error:', error);
      res.status(500).json({ error: 'Failed to save practice exam submission.' });
    }
  });

  // ==================== STUDENT DASHBOARD & PROGRESS ====================
  app.get('/api/student/dashboard', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const gradeCode =
        (typeof req.query.grade === 'string' && req.query.grade) ||
        req.dbUser?.gradeCode ||
        'sec3';
      const academicYear =
        (typeof req.query.year === 'string' && req.query.year) ||
        req.dbUser?.academicYear ||
        '2025-2026';

      const gradeSubjects = await db
        .select()
        .from(subjects)
        .where(eq(subjects.gradeCode, gradeCode));
      const allUnits = await db.select().from(units);
      const allLessons = await db
        .select({
          id: lessons.id,
          unitId: lessons.unitId,
          titleAr: lessons.titleAr,
          titleEn: lessons.titleEn,
          chapterAr: lessons.chapterAr,
          chapterEn: lessons.chapterEn,
        })
        .from(lessons);

      const gradeSubjectIds = new Set(gradeSubjects.map((s) => s.id));
      const gradeUnits = allUnits.filter((u) => gradeSubjectIds.has(u.subjectId));
      const gradeUnitIds = new Set(gradeUnits.map((u) => u.id));
      const gradeLessons = allLessons.filter((l) => gradeUnitIds.has(l.unitId));

      const upcomingAssessments = await db
        .select()
        .from(ministryAssessments)
        .where(eq(ministryAssessments.gradeCode, gradeCode))
        .orderBy(desc(ministryAssessments.publicationDate))
        .limit(6);

      let progressRecords: typeof studentProgress.$inferSelect[] = [];
      let summaries: typeof savedSummaries.$inferSelect[] = [];
      let recentChats: typeof aiConversations.$inferSelect[] = [];
      let recentExams: typeof practiceExams.$inferSelect[] = [];

      if (req.dbUser) {
        [progressRecords, summaries, recentChats, recentExams] = await Promise.all([
          db.select().from(studentProgress).where(eq(studentProgress.userUid, req.dbUser.uid)),
          db
            .select()
            .from(savedSummaries)
            .where(eq(savedSummaries.userUid, req.dbUser.uid))
            .orderBy(desc(savedSummaries.createdAt))
            .limit(8),
          db
            .select()
            .from(aiConversations)
            .where(eq(aiConversations.userUid, req.dbUser.uid))
            .orderBy(desc(aiConversations.updatedAt))
            .limit(6),
          db
            .select()
            .from(practiceExams)
            .where(eq(practiceExams.userUid, req.dbUser.uid))
            .orderBy(desc(practiceExams.createdAt))
            .limit(6),
        ]);
      }

      const completedLessonIds = new Set(
        progressRecords.filter((p) => p.completed).map((p) => p.lessonId)
      );
      const masteryByLesson = new Map(progressRecords.map((p) => [p.lessonId, p.masteryScore]));

      const subjectStats = gradeSubjects.map((s) => {
        const sUnits = gradeUnits.filter((u) => u.subjectId === s.id);
        const sUnitIds = new Set(sUnits.map((u) => u.id));
        const sLessons = gradeLessons.filter((l) => sUnitIds.has(l.unitId));
        const completed = sLessons.filter((l) => completedLessonIds.has(l.id)).length;
        return {
          ...s,
          totalLessons: sLessons.length,
          completedLessons: completed,
          progressPercent: sLessons.length > 0 ? Math.round((completed / sLessons.length) * 100) : 0,
        };
      });

      // Weak topics: studied lessons with mastery < 70 or low practice exam scores
      const weakTopics = gradeLessons
        .filter((l) => {
          const score = masteryByLesson.get(l.id);
          return typeof score === 'number' && score > 0 && score < 70;
        })
        .map((l) => ({
          lessonId: l.id,
          titleAr: l.titleAr,
          titleEn: l.titleEn,
          masteryScore: masteryByLesson.get(l.id) ?? 0,
        }));

      const recommendedLessons = gradeLessons
        .filter((l) => !completedLessonIds.has(l.id))
        .slice(0, 4)
        .map((l) => {
          const u = gradeUnits.find((unit) => unit.id === l.unitId);
          const s = gradeSubjects.find((sub) => sub.id === u?.subjectId);
          return {
            lessonId: l.id,
            titleAr: l.titleAr,
            titleEn: l.titleEn,
            subjectCode: s?.code ?? '',
            subjectNameAr: s?.nameAr ?? '',
            subjectNameEn: s?.nameEn ?? '',
          };
        });

      const totalCompletedInGrade = gradeLessons.filter((l) => completedLessonIds.has(l.id)).length;

      res.json({
        gradeCode,
        academicYear,
        stats: {
          totalSubjects: gradeSubjects.length,
          totalLessons: gradeLessons.length,
          completedLessons: totalCompletedInGrade,
          completionPercent:
            gradeLessons.length > 0 ? Math.round((totalCompletedInGrade / gradeLessons.length) * 100) : 0,
          savedSummariesCount: summaries.length,
          practiceExamsCount: recentExams.length,
          aiSessionsCount: recentChats.length,
        },
        subjects: subjectStats,
        upcomingAssessments,
        savedSummaries: summaries,
        recentConversations: recentChats,
        recentPracticeExams: recentExams,
        weakTopics,
        recommendedLessons,
      });
    } catch (error: any) {
      console.error('Student dashboard error:', error);
      res.status(500).json({ error: 'Failed to load student dashboard.' });
    }
  });

  app.post('/api/student/progress', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { lessonId, completed = true, masteryScore = 85 } = req.body;
      if (!lessonId) return res.status(400).json({ error: 'lessonId is required.' });

      const existing = await db
        .select()
        .from(studentProgress)
        .where(
          and(
            eq(studentProgress.userUid, req.dbUser!.uid),
            eq(studentProgress.lessonId, Number(lessonId))
          )
        )
        .limit(1);

      let record;
      if (existing.length > 0) {
        const updated = await db
          .update(studentProgress)
          .set({
            completed: Boolean(completed),
            masteryScore: Number(masteryScore),
            lastStudiedAt: new Date(),
          })
          .where(eq(studentProgress.id, existing[0].id))
          .returning();
        record = updated[0];
      } else {
        const inserted = await db
          .insert(studentProgress)
          .values({
            userUid: req.dbUser!.uid,
            lessonId: Number(lessonId),
            completed: Boolean(completed),
            masteryScore: Number(masteryScore),
          })
          .returning();
        record = inserted[0];
      }
      res.json({ progress: record });
    } catch (error: any) {
      console.error('Progress update error:', error);
      res.status(500).json({ error: 'Failed to update lesson progress.' });
    }
  });

  // ==================== ADMIN CONTROL PANEL & MOE UPDATE ENGINE ====================
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req: AuthRequest, res) => {
    try {
      const [
        allSubjects,
        allVersions,
        allAssessments,
        monitorLogs,
        allUsers,
        allYears,
        auditLogs,
      ] = await Promise.all([
        db.select().from(subjects).orderBy(subjects.gradeCode, subjects.nameEn),
        db.select().from(curriculumVersions).orderBy(desc(curriculumVersions.createdAt)).limit(30),
        db.select().from(ministryAssessments).orderBy(desc(ministryAssessments.createdAt)).limit(50),
        db.select().from(ministryMonitorLogs).orderBy(desc(ministryMonitorLogs.checkedAt)).limit(20),
        db.select().from(users).orderBy(desc(users.createdAt)).limit(50),
        db.select().from(academicYears).orderBy(desc(academicYears.isActive), academicYears.code),
        db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(40),
      ]);

      res.json({
        subjects: allSubjects,
        versions: allVersions,
        assessments: allAssessments,
        monitorLogs,
        users: allUsers,
        academicYears: allYears,
        auditLogs,
      });
    } catch (error: any) {
      console.error('Admin overview error:', error);
      res.status(500).json({ error: 'Failed to load admin control panel.' });
    }
  });

  // Live Ministry of Education (moe.gov.eg) discovery check
  app.post('/api/admin/moe-check', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const targetUrl =
        typeof req.body.targetUrl === 'string' && req.body.targetUrl.trim()
          ? req.body.targetUrl.trim()
          : 'https://studentbooks.moe.gov.eg/Performance_Assessments/';

      const checkResult = await runMoePortalDiscovery(targetUrl);

      const inserted = await db
        .insert(ministryMonitorLogs)
        .values({
          targetUrl,
          status: checkResult.status,
          discoveredCount: checkResult.discovered.length,
          discoveredResourcesJson: checkResult.discovered,
          notes: checkResult.notes,
        })
        .returning();

      await logAdminAction(req, 'MOE_PORTAL_SCAN', 'ministry_portal', targetUrl, {
        status: checkResult.status,
        discoveredCount: checkResult.discovered.length,
      });

      res.json({ log: inserted[0], discovered: checkResult.discovered });
    } catch (error: any) {
      console.error('MOE check error:', error);
      res.status(400).json({ error: error.message || 'Ministry portal check failed.' });
    }
  });

  // Upload Official Curriculum PDF -> Extract Text -> AI Diff against stored curriculum -> Queue Pending Version (NEVER auto-overwrite!)
  app.post(
    '/api/admin/upload-curriculum',
    requireAuth,
    requireAdmin,
    uploadPdf.single('file'),
    async (req: AuthRequest, res) => {
      try {
        const subjectId = Number(req.body.subjectId);
        const versionLabel = String(req.body.versionLabel || `v${Date.now()}`);
        const academicYear = String(req.body.academicYear || '2025-2026');
        const sourceUrl = String(req.body.sourceUrl || 'https://studentbooks.moe.gov.eg/');
        const documentTitle = String(
          req.body.documentTitle || req.file?.originalname || 'Official Curriculum Document'
        );

        if (!subjectId || Number.isNaN(subjectId)) {
          return res.status(400).json({ error: 'Valid subjectId is required.' });
        }
        if (!req.file) {
          return res.status(400).json({ error: 'Official PDF or text document file is required.' });
        }

        const subjRows = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
        if (subjRows.length === 0) return res.status(404).json({ error: 'Subject not found.' });
        const subject = subjRows[0];

        const buffer = fs.readFileSync(req.file.path);
        const extractedText = await extractTextFromPdfBuffer(buffer, req.file.mimetype);

        // Fetch existing lessons to compare against
        const subjUnits = await db.select().from(units).where(eq(units.subjectId, subject.id));
        const unitIds = new Set(subjUnits.map((u) => u.id));
        const existingLessons = (await db.select().from(lessons)).filter((l) => unitIds.has(l.unitId));
        const existingSummary = existingLessons
          .map((l) => `- ${l.titleAr} (${l.titleEn}): ${l.contentAr.slice(0, 220)}`)
          .join('\n');

        const diffReport = await analyzeCurriculumDiffAndExtract({
          subjectNameAr: subject.nameAr,
          subjectNameEn: subject.nameEn,
          existingLessonsSummary: existingSummary,
          extractedDocumentText: extractedText,
          documentTitle,
        });

        const inserted = await db
          .insert(curriculumVersions)
          .values({
            subjectId: subject.id,
            versionLabel,
            academicYear,
            sourceUrl,
            documentTitle,
            localFilePath: `/uploads/${req.file.filename}`,
            extractedText: extractedText.slice(0, 50000),
            diffSummaryAr: diffReport.diffSummaryAr ?? '',
            diffSummaryEn: diffReport.diffSummaryEn ?? '',
            changeReportJson: {
              addedTopics: diffReport.addedTopics ?? [],
              modifiedLessons: diffReport.modifiedLessons ?? [],
              removedChapters: diffReport.removedChapters ?? [],
              extractedLessonsPreview: diffReport.extractedLessonsPreview ?? [],
            },
            status: 'pending_review',
            uploadedByUid: req.dbUser!.uid,
          })
          .returning();

        await logAdminAction(req, 'UPLOAD_CURRICULUM_VERSION', 'curriculum_version', String(inserted[0].id), {
          subjectCode: subject.code,
          versionLabel,
          documentTitle,
        });

        res.json({ version: inserted[0] });
      } catch (error: any) {
        console.error('Upload curriculum error:', error);
        res.status(error.status || 500).json({ error: error.message || 'Failed to process curriculum PDF.' });
      }
    }
  );

  // Admin explicitly approves a queued curriculum version -> publishes new lessons & archives old version
  app.post('/api/admin/versions/:id/approve', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const rows = await db
        .select()
        .from(curriculumVersions)
        .where(eq(curriculumVersions.id, id))
        .limit(1);
      if (rows.length === 0) return res.status(404).json({ error: 'Version not found.' });
      const version = rows[0];

      // Archive previously approved versions for this subject
      await db
        .update(curriculumVersions)
        .set({ status: 'archived' })
        .where(
          and(
            eq(curriculumVersions.subjectId, version.subjectId),
            eq(curriculumVersions.status, 'approved')
          )
        );

      // Publish extracted lessons preview into a versioned unit if present
      const previews = version.changeReportJson?.extractedLessonsPreview ?? [];
      if (previews.length > 0) {
        const existingUnits = await db
          .select()
          .from(units)
          .where(eq(units.subjectId, version.subjectId));
        let targetUnitId = existingUnits[0]?.id;
        if (!targetUnitId) {
          const newUnit = await db
            .insert(units)
            .values({
              subjectId: version.subjectId,
              semester: 1,
              orderIndex: 1,
              titleAr: previews[0].unitTitleAr || `تحديث ${version.versionLabel}`,
              titleEn: `Update ${version.versionLabel}`,
              descriptionAr: version.diffSummaryAr,
              descriptionEn: version.diffSummaryEn,
            })
            .returning();
          targetUnitId = newUnit[0].id;
        }

        for (let i = 0; i < previews.length; i++) {
          const p = previews[i];
          await db.insert(lessons).values({
            unitId: targetUnitId,
            chapterAr: p.unitTitleAr || version.versionLabel,
            chapterEn: version.versionLabel,
            orderIndex: 10 + i,
            titleAr: p.titleAr,
            titleEn: p.titleEn || p.titleAr,
            contentAr: p.summaryAr || version.extractedText.slice(0, 2000),
            contentEn: null,
            isOfficialEn: false,
            learningObjectivesAr: p.objectivesAr ?? [],
            learningObjectivesEn: [],
            officialSourceUrl: version.sourceUrl || 'https://studentbooks.moe.gov.eg/',
            sourceVerified: isVerifiedMoeUrl(version.sourceUrl || '').verified,
            publishedDate: new Date().toISOString().slice(0, 10),
            versionNumber: 2,
          });
        }
      }

      const updated = await db
        .update(curriculumVersions)
        .set({
          status: 'approved',
          approvedByUid: req.dbUser!.uid,
          publishedAt: new Date(),
        })
        .where(eq(curriculumVersions.id, id))
        .returning();

      await logAdminAction(req, 'APPROVE_CURRICULUM_VERSION', 'curriculum_version', String(id), {
        versionLabel: version.versionLabel,
        lessonsPublished: previews.length,
      });

      res.json({ version: updated[0] });
    } catch (error: any) {
      console.error('Approve version error:', error);
      res.status(500).json({ error: 'Failed to approve curriculum version.' });
    }
  });

  app.post('/api/admin/versions/:id/reject', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const updated = await db
        .update(curriculumVersions)
        .set({ status: 'rejected', approvedByUid: req.dbUser!.uid })
        .where(eq(curriculumVersions.id, id))
        .returning();

      await logAdminAction(req, 'REJECT_CURRICULUM_VERSION', 'curriculum_version', String(id), {});
      res.json({ version: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reject version.' });
    }
  });

  // Upload Official Ministry Assessment PDF (keeps original PDF intact!)
  app.post(
    '/api/admin/upload-assessment',
    requireAuth,
    requireAdmin,
    uploadPdf.single('file'),
    async (req: AuthRequest, res) => {
      try {
        const {
          titleAr,
          titleEn,
          gradeCode,
          subjectCode,
          academicYear = '2025-2026',
          semester = 1,
          periodLabelAr = 'الأسبوع الأول',
          periodLabelEn = 'Week 1',
          assessmentType = 'weekly',
          officialSourceUrl = 'https://studentbooks.moe.gov.eg/Performance_Assessments/',
          publicationDate = new Date().toISOString().slice(0, 10),
          descriptionAr = '',
          descriptionEn = '',
        } = req.body;

        if (!titleAr || !gradeCode || !subjectCode) {
          return res.status(400).json({ error: 'titleAr, gradeCode, and subjectCode are required.' });
        }

        const check = isVerifiedMoeUrl(officialSourceUrl);

        const inserted = await db
          .insert(ministryAssessments)
          .values({
            titleAr,
            titleEn: titleEn || titleAr,
            gradeCode,
            subjectCode,
            academicYear,
            semester: Number(semester),
            periodLabelAr,
            periodLabelEn,
            assessmentType,
            officialSourceUrl,
            sourceDomain: check.domain,
            isOfficialVerified: check.verified,
            localFilePath: req.file ? `/uploads/${req.file.filename}` : null,
            publicationDate,
            descriptionAr,
            descriptionEn,
            practiceQuestionsJson: [],
          })
          .returning();

        await logAdminAction(req, 'UPLOAD_ASSESSMENT', 'ministry_assessment', String(inserted[0].id), {
          titleAr,
          isOfficialVerified: check.verified,
          hasPdf: Boolean(req.file),
        });

        res.json({ assessment: inserted[0] });
      } catch (error: any) {
        console.error('Upload assessment error:', error);
        res.status(500).json({ error: error.message || 'Failed to add assessment.' });
      }
    }
  );

  app.post('/api/admin/subjects', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const {
        code,
        gradeCode,
        nameAr,
        nameEn,
        track = 'all',
        languageTrack = 'arabic_and_english',
        academicYear = '2025-2026',
        descriptionAr = '',
        descriptionEn = '',
        officialBookUrlAr = 'https://studentbooks.moe.gov.eg/',
        officialBookUrlEn = null,
      } = req.body;

      if (!code || !gradeCode || !nameAr || !nameEn) {
        return res.status(400).json({ error: 'code, gradeCode, nameAr, and nameEn are required.' });
      }

      const inserted = await db
        .insert(subjects)
        .values({
          code: code.toLowerCase().trim(),
          gradeCode,
          nameAr,
          nameEn,
          track,
          languageTrack,
          academicYear,
          descriptionAr,
          descriptionEn,
          officialBookUrlAr,
          officialBookUrlEn: officialBookUrlEn || null,
        })
        .returning();

      await logAdminAction(req, 'CREATE_SUBJECT', 'subject', inserted[0].code, { gradeCode, nameEn });
      res.json({ subject: inserted[0] });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create subject.' });
    }
  });

  app.post('/api/admin/academic-years', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { code, labelAr, labelEn, isActive = false } = req.body;
      if (!code || !labelAr || !labelEn) {
        return res.status(400).json({ error: 'code, labelAr, and labelEn are required.' });
      }
      if (isActive) {
        await db.update(academicYears).set({ isActive: false });
      }
      const inserted = await db
        .insert(academicYears)
        .values({ code, labelAr, labelEn, isActive: Boolean(isActive) })
        .returning();

      await logAdminAction(req, 'CREATE_ACADEMIC_YEAR', 'academic_year', code, { isActive });
      res.json({ academicYear: inserted[0] });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create academic year.' });
    }
  });

  app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const role = req.body.role === 'admin' ? 'admin' : 'student';
      const updated = await db
        .update(users)
        .set({ role, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await logAdminAction(req, 'UPDATE_USER_ROLE', 'user', String(id), { newRole: role });
      res.json({ user: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update user role.' });
    }
  });

  // RAG diagnostic endpoint (for verifying semantic retrieval on any query)
  app.get('/api/rag/retrieve', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const grade = typeof req.query.grade === 'string' ? req.query.grade : undefined;
      const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
      const chunks = await retrieveCurriculumContext({
        query: q,
        gradeCode: grade,
        subjectCode: subject,
        topK: 4,
      });
      res.json({ chunks });
    } catch (error: any) {
      res.status(500).json({ error: 'RAG retrieval failed.' });
    }
  });

  // Frontend serving (Vite dev middleware in dev, dist/ static in production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Study Egyptian Education Platform listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

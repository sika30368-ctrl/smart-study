import { GoogleGenAI, Type } from '@google/genai';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { lessons, subjects, units } from '../src/db/schema.ts';

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiServiceError(
      'GEMINI_API_KEY is not configured on the server. Please select an API key in Settings > Secrets.',
      403,
      'API_KEY_MISSING'
    );
  }
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedApiKey = apiKey;
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

export class AiServiceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = 'AI_ERROR', options?: ErrorOptions) {
    super(message, options);
    this.name = 'AiServiceError';
    this.status = status;
    this.code = code;
  }
}

function isQuotaOrRateLimitError(err: any): boolean {
  const msg = String(err?.message ?? err ?? '');
  const status = err?.status ?? err?.code;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('RATE_LIMIT_EXCEEDED') ||
    msg.includes('Quota exceeded')
  );
}

function isAuthKeyError(err: any): boolean {
  const msg = String(err?.message ?? err ?? '');
  const status = err?.status ?? err?.code;
  return (
    status === 403 ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API_KEY_INVALID')
  );
}

export async function generateContentWithResilience(params: {
  contents: any;
  config?: Record<string, any>;
}) {
  const ai = getAiClient();
  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message ?? '');
        const zeroQuota = msg.includes('"quota_limit_value":"0"') || msg.includes('limit: 0');

        // If this model has 0 RPM quota in the current region/tier, immediately try the next model
        if (isQuotaOrRateLimitError(err)) {
          if (zeroQuota) {
            break;
          }
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 800));
            continue;
          }
          break;
        }
        // Non-rate-limit error (e.g. 400/403): don't silently retry across models
        break;
      }
    }
  }

  if (isQuotaOrRateLimitError(lastError)) {
    throw new AiServiceError(
      'تم بلوغ حد الحصة المتاحة لـ Gemini API (429 RESOURCE_EXHAUSTED) في المنطقة الحالية. يرجى فتح Settings > Secrets واختيار مفتاح Gemini API مرتبط بحساب فوترة (Billing-enabled) لرفع الحصة. | Gemini API quota limit reached (429 RESOURCE_EXHAUSTED). Please open Settings > Secrets and select a billing-enabled Gemini API key to increase your quota.',
      429,
      'RESOURCE_EXHAUSTED',
      { cause: lastError }
    );
  }
  if (isAuthKeyError(lastError)) {
    throw new AiServiceError(
      'مفتاح Gemini API غير صالح أو لا يملك الصلاحية. يرجى التحقق منه في Settings > Secrets. | Gemini API key permission denied or invalid. Please verify your API key in Settings > Secrets.',
      403,
      'API_KEY_INVALID',
      { cause: lastError }
    );
  }
  throw new AiServiceError(
    lastError?.message || 'Gemini AI request failed. Please try again shortly.',
    500,
    'AI_REQUEST_FAILED',
    { cause: lastError }
  );
}

export interface RagLessonChunk {
  lessonId: number;
  subjectCode: string;
  subjectNameAr: string;
  subjectNameEn: string;
  gradeCode: string;
  unitTitleAr: string;
  unitTitleEn: string;
  titleAr: string;
  titleEn: string;
  contentAr: string;
  contentEn: string | null;
  isOfficialEn: boolean;
  formulasRules: { labelAr: string; labelEn: string; expression: string }[];
  officialSourceUrl: string;
  score: number;
}

function normalizeBilingualText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic tashkeel diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

function lexicalScore(query: string, text: string): number {
  const normalizedQuery = normalizeBilingualText(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery
    .split(/[\s,.;:!?()[\]،؛؟]+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  const hay = normalizeBilingualText(text);
  let matches = 0;
  for (const token of tokens) {
    if (hay.includes(token)) matches += 1;
  }
  return matches / tokens.length;
}

export async function retrieveCurriculumContext(params: {
  query: string;
  gradeCode?: string;
  subjectCode?: string;
  lessonId?: number;
  topK?: number;
}): Promise<RagLessonChunk[]> {
  const { query, gradeCode, subjectCode, lessonId, topK = 3 } = params;

  const rows = await db
    .select({
      lesson: lessons,
      unit: units,
      subject: subjects,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(subjects, eq(units.subjectId, subjects.id));

  let candidates = rows;
  if (lessonId) {
    const exact = rows.filter((r) => r.lesson.id === lessonId);
    if (exact.length > 0) {
      candidates = exact;
    }
  } else {
    if (gradeCode) {
      const byGrade = candidates.filter((r) => r.subject.gradeCode === gradeCode);
      if (byGrade.length > 0) candidates = byGrade;
    }
    if (subjectCode) {
      const bySubj = candidates.filter((r) => r.subject.code === subjectCode);
      if (bySubj.length > 0) candidates = bySubj;
    }
  }

  const scored: RagLessonChunk[] = [];
  for (const row of candidates) {
    const combinedText = `${row.subject.nameAr} ${row.subject.nameEn} ${row.unit.titleAr} ${row.unit.titleEn} ${row.lesson.titleAr} ${row.lesson.titleEn} ${row.lesson.contentAr} ${row.lesson.contentEn ?? ''} ${JSON.stringify(row.lesson.keyDefinitionsAr ?? [])} ${JSON.stringify(row.lesson.formulasRules ?? [])}`;
    const score = lessonId && row.lesson.id === lessonId ? 1.0 : lexicalScore(query, combinedText);

    scored.push({
      lessonId: row.lesson.id,
      subjectCode: row.subject.code,
      subjectNameAr: row.subject.nameAr,
      subjectNameEn: row.subject.nameEn,
      gradeCode: row.subject.gradeCode,
      unitTitleAr: row.unit.titleAr,
      unitTitleEn: row.unit.titleEn,
      titleAr: row.lesson.titleAr,
      titleEn: row.lesson.titleEn,
      contentAr: row.lesson.contentAr,
      contentEn: row.lesson.contentEn,
      isOfficialEn: row.lesson.isOfficialEn,
      formulasRules: row.lesson.formulasRules ?? [],
      officialSourceUrl: row.lesson.officialSourceUrl,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function buildContextBlock(chunks: RagLessonChunk[]): string {
  if (chunks.length === 0) {
    return 'NO_MATCHING_OFFICIAL_CURRICULUM_DOCUMENTS_FOUND';
  }
  return chunks
    .map(
      (c, i) => `--- [SOURCE ${i + 1}] ---
Grade: ${c.gradeCode}
Subject: ${c.subjectNameAr} / ${c.subjectNameEn}
Unit: ${c.unitTitleAr} / ${c.unitTitleEn}
Lesson: ${c.titleAr} / ${c.titleEn}
Official English Edition Available: ${c.isOfficialEn ? 'YES' : 'NO (Arabic official text only)'}
Official Ministry Portal Reference: ${c.officialSourceUrl}
Arabic Curriculum Content:
${c.contentAr}
${c.contentEn ? `Official English Curriculum Content:\n${c.contentEn}` : ''}
Key Rules/Formulas: ${c.formulasRules.map((f) => `${f.labelEn} (${f.labelAr}): ${f.expression}`).join('; ')}
`
    )
    .join('\n\n');
}

export async function generateLessonSummary(params: {
  lessonId: number;
  summaryType: string;
  language: 'ar' | 'en';
}) {
  const chunks = await retrieveCurriculumContext({ query: '', lessonId: params.lessonId, topK: 1 });
  if (chunks.length === 0) {
    throw new Error('Lesson not found in the curriculum database.');
  }
  const lesson = chunks[0];

  const summaryInstructions: Record<string, string> = {
    short: 'Create a concise 5–8 bullet executive summary capturing the core takeaways.',
    detailed: 'Create a comprehensive structured study guide covering every concept thoroughly.',
    key_points: 'List the highest-yield exam key points and common Egyptian exam pitfalls.',
    definitions: 'Extract and clearly explain every scientific/academic definition in a clean table or structured list.',
    formulas: 'Extract all mathematical/scientific rules, laws, units, and formulas with worked examples.',
    mind_map: 'Create a structured hierarchical Mind Map outline using clean nested Markdown branches (Main Concept → Branches → Sub-concepts → Formulas/Examples).',
    revision: 'Create night-before-exam rapid revision notes with quick self-check memory triggers.',
    objectives: 'List the expected official learning objectives and explain how each objective is typically tested in Egyptian exams.',
  };

  const modePrompt = summaryInstructions[params.summaryType] ?? summaryInstructions.short;
  const langInstruction =
    params.language === 'ar'
      ? 'Write the entire response in clear, accurate Egyptian academic Arabic (الفصحى التعليمية السلسة).'
      : lesson.isOfficialEn
      ? 'Write the response in clear academic English matching the official Egyptian Language Schools curriculum terminology.'
      : 'Write the response in clear English, and include a clear opening note stating that the official Ministry textbook for this subject is published in Arabic only and this English study summary is AI-generated.';

  const systemInstruction = `You are Smart Study AI, an expert Egyptian curriculum educational specialist.
Rules:
1. Base your summary strictly on the provided official Egyptian curriculum text.
2. Clearly organize your output with Markdown sections that distinguish:
   - Official Curriculum Points (معلومات المنهج الرسمي / Official Curriculum Content)
   - AI-Generated Study Explanation (شرح وتلخيص الذكاء الاصطناعي / AI-Generated Explanation)
3. Always cite the exact Lesson title, Unit, and Official Ministry Source URL at the end.
4. Never fabricate official Ministry decrees or unverified textbook quotes.
${langInstruction}`;

  const response = await generateContentWithResilience({
    contents: `Task: ${modePrompt}\n\nRetrieved Curriculum Context:\n${buildContextBlock(chunks)}`,
    config: {
      systemInstruction,
    },
  });

  return {
    contentMarkdown: response.text ?? '',
    citations: [
      {
        title: params.language === 'ar' ? `${lesson.subjectNameAr} — ${lesson.titleAr}` : `${lesson.subjectNameEn} — ${lesson.titleEn}`,
        sourceUrl: lesson.officialSourceUrl,
        type: lesson.isOfficialEn || params.language === 'ar' ? 'official_curriculum' : 'ai_translated_from_official_ar',
      },
    ],
  };
}

export async function generateAiLessonTranslation(lessonId: number) {
  const chunks = await retrieveCurriculumContext({ query: '', lessonId, topK: 1 });
  if (chunks.length === 0) throw new Error('Lesson not found.');
  const lesson = chunks[0];

  const response = await generateContentWithResilience({
    contents: `Translate the following official Arabic Egyptian curriculum lesson accurately into clear academic English for study assistance. Keep Arabic grammatical terms/examples in Arabic with transliteration where appropriate.\n\nTitle: ${lesson.titleAr}\nContent:\n${lesson.contentAr}`,
    config: {
      systemInstruction:
        'You are an educational translator for Egyptian curricula. Produce a faithful, clear English study translation. Always remind the reader this is an AI-generated study translation, not an official Ministry of Education English textbook.',
    },
  });

  return {
    translatedMarkdown: response.text ?? '',
    disclaimer:
      'AI-Generated Translation — No official English Ministry of Education edition exists for this subject. Original Arabic curriculum text remains the official reference.',
  };
}

export async function solveStudentProblem(params: {
  questionText: string;
  gradeCode: string;
  subjectCode?: string;
  language: 'ar' | 'en';
  imageBase64?: string;
  imageMimeType?: string;
}) {
  const chunks = await retrieveCurriculumContext({
    query: params.questionText || params.subjectCode || params.gradeCode,
    gradeCode: params.gradeCode,
    subjectCode: params.subjectCode,
    topK: 3,
  });

  const langRule =
    params.language === 'ar'
      ? 'Respond completely in clear Egyptian academic Arabic.'
      : 'Respond completely in clear academic English.';

  const systemInstruction = `You are Smart Study Problem Solver, an expert Egyptian curriculum tutor (Preparatory 1–3 & Secondary 1–3).
Analyze the student's text problem and/or uploaded homework image carefully.
Ground your rules and terminology in the retrieved Egyptian curriculum context whenever applicable.
If the problem falls outside the retrieved curriculum lessons, still help the student accurately while clearly marking it as general educational guidance rather than an official textbook excerpt.
${langRule}`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (params.imageBase64 && params.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: params.imageMimeType,
        data: params.imageBase64,
      },
    });
  }

  parts.push({
    text: `Student Grade: ${params.gradeCode}
Student Question: ${params.questionText || 'Please read and solve the problem shown in the attached homework image.'}

Retrieved Egyptian Curriculum Reference Context:
${buildContextBlock(chunks)}

Provide a complete pedagogical breakdown.`,
  });

  const response = await generateContentWithResilience({
    contents: { parts },
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectIdentified: { type: Type.STRING },
          topicIdentified: { type: Type.STRING },
          curriculumAlignment: {
            type: Type.STRING,
            description: 'State which Egyptian curriculum lesson matches, or note if it is general educational assistance.',
          },
          rulesAndFormulas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                stepNumber: { type: Type.INTEGER },
                action: { type: Type.STRING },
                whyNecessary: { type: Type.STRING },
                workShown: { type: Type.STRING },
              },
              required: ['stepNumber', 'action', 'whyNecessary', 'workShown'],
            },
          },
          finalAnswer: { type: Type.STRING },
          similarPracticeQuestion: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              hint: { type: Type.STRING },
              solutionSummary: { type: Type.STRING },
            },
            required: ['question', 'hint', 'solutionSummary'],
          },
        },
        required: [
          'subjectIdentified',
          'topicIdentified',
          'curriculumAlignment',
          'rulesAndFormulas',
          'steps',
          'finalAnswer',
          'similarPracticeQuestion',
        ],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim());
  return {
    solution: parsed,
    citations: chunks.map((c) => ({
      lessonId: c.lessonId,
      titleAr: `${c.subjectNameAr} — ${c.titleAr}`,
      titleEn: `${c.subjectNameEn} — ${c.titleEn}`,
      sourceUrl: c.officialSourceUrl,
    })),
  };
}

export async function runAiStudyTutor(params: {
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  gradeCode: string;
  subjectCode?: string;
  lessonId?: number;
  language: 'ar' | 'en';
}) {
  const chunks = await retrieveCurriculumContext({
    query: params.message,
    gradeCode: params.gradeCode,
    subjectCode: params.subjectCode,
    lessonId: params.lessonId,
    topK: 3,
  });

  const langRule =
    params.language === 'ar'
      ? 'Respond in warm, clear Arabic suitable for an Egyptian student in the specified grade.'
      : 'Respond in warm, clear English suitable for an Egyptian student in the specified grade.';

  const systemInstruction = `You are Smart Study AI Tutor, a Socratic Egyptian educational tutor.
Strict RAG & Grounding Rules:
1. Adapt explanation depth to student grade: ${params.gradeCode}.
2. Use the retrieved Egyptian curriculum context as your primary authority.
3. Explicitly structure your reply to distinguish between:
   - Official Curriculum Reference (from the retrieved Egyptian lesson, citing the lesson title)
   - AI Explanation & Examples (simple intuitive explanation with concrete examples)
   - Check-for-Understanding Follow-up Question (ask 1 thoughtful follow-up question so the student truly understands rather than memorizing)
4. If the question cannot be verified from the retrieved Egyptian curriculum, state transparently: "This point is not found in the currently stored official lesson text; here is general educational guidance..." — NEVER invent official Ministry answers.
${langRule}`;

  const historyText = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
    .join('\n');

  const prompt = `Retrieved Official Egyptian Curriculum Context:
${buildContextBlock(chunks)}

Conversation History:
${historyText || '(Start of session)'}

Student's New Message:
${params.message}`;

  const response = await generateContentWithResilience({
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return {
    reply: response.text ?? '',
    citations: chunks.map((c) => ({
      lessonId: c.lessonId,
      titleAr: `${c.subjectNameAr} — ${c.titleAr}`,
      titleEn: `${c.subjectNameEn} — ${c.titleEn}`,
      sourceUrl: c.officialSourceUrl,
    })),
  };
}

export async function generatePracticeExam(params: {
  gradeCode: string;
  subjectCode: string;
  semester: number;
  unitTitle?: string;
  lessonId?: number;
  lessonTitle?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionCount: number;
  questionTypes: ('mcq' | 'true_false' | 'complete' | 'written' | 'math_problem')[];
  language: 'ar' | 'en';
  assessmentContextText?: string;
}) {
  const chunks = await retrieveCurriculumContext({
    query: `${params.unitTitle ?? ''} ${params.lessonTitle ?? ''} ${params.subjectCode}`,
    gradeCode: params.gradeCode,
    subjectCode: params.subjectCode,
    lessonId: params.lessonId,
    topK: 3,
  });

  const count = Math.min(Math.max(params.questionCount || 5, 3), 12);
  const typesList = params.questionTypes.length > 0 ? params.questionTypes : ['mcq', 'true_false', 'complete', 'written'];

  const langRule =
    params.language === 'ar'
      ? 'Generate all questions, options, answers, and step-by-step explanations in Egyptian academic Arabic.'
      : 'Generate all questions, options, answers, and step-by-step explanations in clear academic English.';

  const systemInstruction = `You are Smart Study Practice Exam Generator for the Egyptian education system.
Generate an interactive AI PRACTICE EXAM (clearly separate from official Ministry exams) grounded strictly in the provided Egyptian curriculum context.
- Distribute questions across the requested types: ${typesList.join(', ')}.
- For "mcq": provide exactly 4 distinct options.
- For "true_false": provide exactly 2 options (${params.language === 'ar' ? '["صواب", "خطأ"]' : '["True", "False"]'}).
- For "complete" (fill-in-the-blank): include a clear blank "______" in the prompt and leave options empty [].
- For "written" and "math_problem": leave options empty [] and give a clear step-by-step model answer in the answer key.
- Generate the questions array and the separate answerKey array matching by exact id ("q1", "q2", ...).
${langRule}`;

  const response = await generateContentWithResilience({
    contents: `Generate a ${params.difficulty}-difficulty practice exam with exactly ${count} questions.
Grade: ${params.gradeCode} | Subject: ${params.subjectCode} | Semester: ${params.semester}
${params.unitTitle ? `Unit Focus: ${params.unitTitle}` : ''}
${params.lessonTitle ? `Lesson Focus: ${params.lessonTitle}` : ''}
${params.assessmentContextText ? `Official Assessment Topic Context:\n${params.assessmentContextText}` : ''}

Retrieved Curriculum Material:
${buildContextBlock(chunks)}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          examTitle: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                prompt: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                points: { type: Type.INTEGER },
              },
              required: ['id', 'type', 'prompt', 'points'],
            },
          },
          answerKey: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                curriculumReference: { type: Type.STRING },
              },
              required: ['id', 'correctAnswer', 'explanation', 'curriculumReference'],
            },
          },
        },
        required: ['examTitle', 'questions', 'answerKey'],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim());
}

export async function analyzeCurriculumDiffAndExtract(params: {
  subjectNameAr: string;
  subjectNameEn: string;
  existingLessonsSummary: string;
  extractedDocumentText: string;
  documentTitle: string;
}) {
  const response = await generateContentWithResilience({
    contents: `Compare the newly uploaded/discovered Egyptian Ministry curriculum document against the currently stored curriculum for "${params.subjectNameAr} (${params.subjectNameEn})".

Currently Stored Lessons:
${params.existingLessonsSummary || 'No lessons currently stored for this subject.'}

New Document Title: ${params.documentTitle}
Extracted Document Text (first 12,000 chars):
${params.extractedDocumentText.slice(0, 12000)}

Produce a bilingual Change Report identifying added topics, modified lessons, removed chapters, and structured lesson previews ready for administrator review prior to approval.`,
    config: {
      systemInstruction:
        'You are an Egyptian Curriculum Change Detection specialist. Never fabricate changes not present in the extracted text. Be precise, objective, and structured.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          diffSummaryAr: { type: Type.STRING },
          diffSummaryEn: { type: Type.STRING },
          addedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          modifiedLessons: { type: Type.ARRAY, items: { type: Type.STRING } },
          removedChapters: { type: Type.ARRAY, items: { type: Type.STRING } },
          extractedLessonsPreview: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                unitTitleAr: { type: Type.STRING },
                titleAr: { type: Type.STRING },
                titleEn: { type: Type.STRING },
                summaryAr: { type: Type.STRING },
                objectivesAr: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['unitTitleAr', 'titleAr', 'titleEn', 'summaryAr', 'objectivesAr'],
            },
          },
        },
        required: [
          'diffSummaryAr',
          'diffSummaryEn',
          'addedTopics',
          'modifiedLessons',
          'removedChapters',
          'extractedLessonsPreview',
        ],
      },
    },
  });

  return JSON.parse((response.text ?? '{}').trim());
}

export async function ocrPdfOrImageWithGemini(buffer: Buffer, mimeType: string): Promise<string> {
  const response = await generateContentWithResilience({
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        },
        {
          text: 'Extract all Arabic and English educational text, headings, definitions, formulas, and exercises faithfully from this official document without summarizing or altering facts.',
        },
      ],
    },
  });
  return response.text ?? '';
}

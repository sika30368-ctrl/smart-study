import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Languages,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface LessonDetailResponse {
  lesson: {
    id: number;
    chapterAr: string;
    chapterEn: string;
    titleAr: string;
    titleEn: string;
    contentAr: string;
    contentEn: string | null;
    isOfficialEn: boolean;
    learningObjectivesAr: string[];
    learningObjectivesEn: string[];
    keyDefinitionsAr: { term: string; definition: string }[];
    keyDefinitionsEn: { term: string; definition: string }[];
    formulasRules: { labelAr: string; labelEn: string; expression: string; noteAr?: string; noteEn?: string }[];
    exercisesAr: { question: string; hint?: string; answer: string }[];
    exercisesEn: { question: string; hint?: string; answer: string }[];
    revisionNotesAr: string;
    revisionNotesEn: string | null;
    officialSourceUrl: string;
    sourceVerified: boolean;
    publishedDate: string;
    versionNumber: number;
  };
  unit: { id: number; semester: number; titleAr: string; titleEn: string };
  subject: { id: number; code: string; gradeCode: string; nameAr: string; nameEn: string };
  progress: { completed: boolean; masteryScore: number } | null;
  savedSummaries: {
    id: number;
    summaryType: string;
    language: string;
    contentMarkdown: string;
    createdAt: string;
  }[];
}

const SUMMARY_MODES = [
  { id: 'short', ar: 'ملخص سريع', en: 'Short Summary' },
  { id: 'detailed', ar: 'شرح مفصل', en: 'Detailed Summary' },
  { id: 'key_points', ar: 'أهم النقاط الامتحانية', en: 'Important Points' },
  { id: 'definitions', ar: 'التعريفات الأساسية', en: 'Key Definitions' },
  { id: 'formulas', ar: 'القوانين والقواعد', en: 'Rules & Formulas' },
  { id: 'mind_map', ar: 'خريطة ذهنية', en: 'Mind Map' },
  { id: 'revision', ar: 'مراجعة ليلة الامتحان', en: 'Revision Notes' },
  { id: 'objectives', ar: 'نواتج التعلم المتوقعة', en: 'Learning Objectives' },
];

export const LessonPage: React.FC = () => {
  const { lessonId } = useParams();
  const { lang, t, authFetch, firebaseUser } = useApp();

  const [data, setData] = useState<LessonDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLang, setContentLang] = useState<'ar' | 'en'>(lang);
  const [activeTab, setActiveTab] = useState<'lesson' | 'definitions' | 'exercises' | 'ai_summary'>('lesson');
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  // AI Translation state (when official EN does not exist)
  const [aiTranslation, setAiTranslation] = useState<{ translatedMarkdown: string; disclaimer: string } | null>(null);
  const [translating, setTranslating] = useState(false);

  // AI Summarizer state
  const [summaryMode, setSummaryMode] = useState('short');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{
    contentMarkdown: string;
    citations: { title: string; sourceUrl: string; type: string }[];
  } | null>(null);
  const [summaryError, setSummaryError] = useState('');

  // Progress toggle
  const [completed, setCompleted] = useState(false);
  const [masteryScore, setMasteryScore] = useState(85);
  const [savingProg, setSavingProg] = useState(false);

  const BackArrow = lang === 'ar' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    setContentLang(lang);
  }, [lang]);

  useEffect(() => {
    if (!lessonId) return;
    let active = true;
    setLoading(true);
    setAiTranslation(null);
    setSummaryResult(null);
    authFetch(`/api/curriculum/lessons/${encodeURIComponent(lessonId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (active && json.lesson) {
          setData(json);
          setCompleted(Boolean(json.progress?.completed));
          setMasteryScore(json.progress?.masteryScore || 85);
        }
      })
      .catch((err) => console.error('Lesson load failed:', err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lessonId, authFetch]);

  const handleRequestAiTranslation = async () => {
    if (!data) return;
    setTranslating(true);
    try {
      const res = await authFetch('/api/ai/translate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: data.lesson.id }),
      });
      const json = await res.json();
      if (res.ok) setAiTranslation(json);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  };

  const handleGenerateSummary = async (modeId: string) => {
    if (!data) return;
    setSummaryMode(modeId);
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const res = await authFetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: data.lesson.id,
          summaryType: modeId,
          language: lang,
          save: Boolean(firebaseUser),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Summary failed');
      setSummaryResult({
        contentMarkdown: json.contentMarkdown,
        citations: json.citations || [],
      });
    } catch (err: any) {
      setSummaryError(err.message || t('تعذر إنشاء الملخص حالياً.', 'Could not generate summary.'));
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleToggleCompleted = async (nextCompleted: boolean, nextMastery = masteryScore) => {
    if (!data || !firebaseUser) return;
    setSavingProg(true);
    try {
      const res = await authFetch('/api/student/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: data.lesson.id,
          completed: nextCompleted,
          masteryScore: nextMastery,
        }),
      });
      if (res.ok) {
        setCompleted(nextCompleted);
        setMasteryScore(nextMastery);
      }
    } finally {
      setSavingProg(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
        <div className="h-96 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t('الدرس غير موجود.', 'Lesson not found.')}
        </p>
      </div>
    );
  }

  const { lesson, unit, subject } = data;
  const objectives =
    contentLang === 'en' && lesson.learningObjectivesEn.length > 0
      ? lesson.learningObjectivesEn
      : lesson.learningObjectivesAr;
  const definitions =
    contentLang === 'en' && lesson.keyDefinitionsEn.length > 0
      ? lesson.keyDefinitionsEn
      : lesson.keyDefinitionsAr;
  const exercises =
    contentLang === 'en' && lesson.exercisesEn.length > 0
      ? lesson.exercisesEn
      : lesson.exercisesAr;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={`/curriculum/${subject.code}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <BackArrow className="w-3.5 h-3.5" />
          <span>
            {lang === 'ar' ? subject.nameAr : subject.nameEn} / {lang === 'ar' ? unit.titleAr : unit.titleEn}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <a
            href={lesson.officialSourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t('المصدر الرسمي (moe.gov.eg)', 'Official MOE Source')}</span>
          </a>
        </div>
      </div>

      {/* Lesson Header Card */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? lesson.chapterAr : lesson.chapterEn}
              {' · '}
              <span className="font-mono tabular-nums">
                {t('إصدار', 'Version')} {lesson.versionNumber} · {lesson.publishedDate}
              </span>
              {' · '}
              {lesson.sourceVerified
                ? t('محتوى مرتبط بالمنهج الرسمي المصري', 'Aligned with Official Egyptian Curriculum')
                : t('محتوى إضافي', 'Supplementary')}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {contentLang === 'ar' ? lesson.titleAr : lesson.titleEn}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Official AR / EN Curriculum Version Toggle */}
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setContentLang('ar')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  contentLang === 'ar'
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t('النسخة العربية الرسمية', 'Official Arabic')}
              </button>
              <button
                onClick={() => setContentLang('en')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  contentLang === 'en'
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {lesson.isOfficialEn
                  ? t('النسخة الإنجليزية الرسمية (لغات)', 'Official English (Lang. Schools)')
                  : t('الإنجليزية (غير رسمي)', 'English (No Official Ed.)')}
              </button>
            </div>

            {firebaseUser && (
              <button
                onClick={() => handleToggleCompleted(!completed)}
                disabled={savingProg}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  completed
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{completed ? t('مكتمل', 'Completed') : t('تحديد كمكتمل', 'Mark Complete')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
          {[
            { id: 'lesson', ar: 'شرح الدرس ونواتج التعلم', en: 'Lesson & Objectives' },
            { id: 'definitions', ar: 'التعريفات والقوانين', en: 'Definitions & Formulas' },
            { id: 'exercises', ar: 'التدريبات والمراجعة', en: 'Exercises & Revision' },
            { id: 'ai_summary', ar: 'التلخيص الذكي (Gemini RAG)', en: 'AI Summarizer (RAG)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {lang === 'ar' ? tab.ar : tab.en}
            </button>
          ))}
        </div>
      </section>

      {/* Tab 1: Lesson Content & Learning Objectives */}
      {activeTab === 'lesson' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
            {contentLang === 'en' && !lesson.isOfficialEn ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-300 dark:border-amber-700/70 bg-amber-50/70 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs sm:text-sm text-amber-950 dark:text-amber-200 space-y-2">
                    <p className="font-semibold">
                      {t(
                        'لا توجد نسخة إنجليزية رسمية من وزارة التربية والتعليم لهذه المادة.',
                        'No Official Ministry English Edition Exists for This Subject'
                      )}
                    </p>
                    <p>
                      {t(
                        'وفق سياسة الأمانة العلمية في Smart Study، لا نعرض أي ترجمة آلية بوصفها وثيقة وزارية رسمية. يمكنك قراءة النص العربي الرسمي أو طلب ترجمة تعليمية مساعدة بالذكاء الاصطناعي (موسومة بوضوح).',
                        'Smart Study never presents an AI translation as an official Ministry textbook. You can read the official Arabic version or request a clearly labeled AI-generated study translation below.'
                      )}
                    </p>
                    <button
                      onClick={handleRequestAiTranslation}
                      disabled={translating}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
                    >
                      {translating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Languages className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {translating
                          ? t('جاري الترجمة بالذكاء الاصطناعي...', 'Generating AI translation...')
                          : t('إنشاء ترجمة دراسية بالذكاء الاصطناعي (غير رسمية)', 'Generate AI Study Translation (Unofficial)')}
                      </span>
                    </button>
                  </div>
                </div>

                {aiTranslation && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                      {aiTranslation.disclaimer}
                    </div>
                    <div className="study-prose text-sm sm:text-base text-slate-800 dark:text-slate-200" dir="ltr">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {aiTranslation.translatedMarkdown}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                dir={contentLang === 'ar' ? 'rtl' : 'ltr'}
                className="space-y-4 text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-8 whitespace-pre-line"
              >
                {contentLang === 'ar' ? lesson.contentAr : lesson.contentEn}
              </div>
            )}
          </div>

          <aside className="lg:col-span-4 space-y-5">
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('نواتج التعلم المستهدفة', 'Official Learning Objectives')}
              </h2>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 list-disc ps-5">
                {objectives.map((obj, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {obj}
                  </li>
                ))}
              </ul>
            </div>

            {firebaseUser && (
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                  <span>{t('مستوى فهمك لهذا الدرس', 'Self-Assessed Mastery')}</span>
                  <span className="font-mono tabular-nums text-[#0E5A6D] dark:text-[#4DD0E1]">
                    {masteryScore}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={masteryScore}
                  onChange={(e) => setMasteryScore(Number(e.target.value))}
                  onMouseUp={() => handleToggleCompleted(completed, masteryScore)}
                  onTouchEnd={() => handleToggleCompleted(completed, masteryScore)}
                  className="w-full accent-[#0E5A6D]"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {masteryScore < 70
                    ? t('سيظهر هذا الدرس ضمن "الموضوعات التي تحتاج لمراجعة" في لوحة الطالب.', 'Appears under "Topics Needing Review" on your dashboard.')
                    : t('مستوى إتقان ممتاز لهذا الدرس.', 'Strong mastery recorded for this lesson.')}
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t('اطلب مساعدة المعلم الذكي في هذا الدرس', 'Need help with this lesson?')}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t(
                  'تحدث مع المدرس الذكي المرتبط بنص هذا الدرس أو اطلب إنشاء اختبار تدريبي فوري.',
                  'Chat with the RAG tutor grounded directly in this lesson or generate a custom practice quiz.'
                )}
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  to={`/ai-studio?tab=tutor&grade=${subject.gradeCode}&subject=${subject.code}&lessonId=${lesson.id}`}
                  className="w-full text-center px-4 py-2 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] text-white text-xs font-semibold"
                >
                  {t('اسأل المدرس الذكي عن هذا الدرس', 'Ask AI Tutor About This Lesson')}
                </Link>
                <Link
                  to={`/ai-studio?tab=exam&grade=${subject.gradeCode}&subject=${subject.code}&lessonId=${lesson.id}`}
                  className="w-full text-center px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t('اختبر نفسك في هذا الدرس', 'Generate Practice Exam')}
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Tab 2: Definitions & Formulas */}
      {activeTab === 'definitions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('التعريفات والمصطلحات العلمية', 'Key Definitions & Terminology')}
            </h2>
            {definitions.length === 0 ? (
              <p className="text-sm text-slate-500">{t('لا توجد تعريفات مسجلة.', 'No definitions listed.')}</p>
            ) : (
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                {definitions.map((d, i) => (
                  <div key={i} className="py-3.5 first:pt-0 last:pb-0">
                    <dt className="text-sm font-bold text-[#0E5A6D] dark:text-[#4DD0E1]">{d.term}</dt>
                    <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                      {d.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('القوانين والقواعد والعلاقات الرياضية', 'Key Rules & Formulas')}
            </h2>
            {lesson.formulasRules.length === 0 ? (
              <p className="text-sm text-slate-500">
                {t('لا توجد قوانين رياضية محددة لهذا الدرس.', 'No mathematical formulas for this lesson.')}
              </p>
            ) : (
              <div className="space-y-3">
                {lesson.formulasRules.map((f, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 space-y-1.5"
                  >
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      {lang === 'ar' ? f.labelAr : f.labelEn}
                    </div>
                    <div className="font-mono text-sm sm:text-base font-semibold text-slate-900 dark:text-white" dir="ltr">
                      {f.expression}
                    </div>
                    {(f.noteAr || f.noteEn) && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {lang === 'ar' ? f.noteAr : f.noteEn}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 3: Exercises & Revision Notes */}
      {activeTab === 'exercises' && (
        <div className="space-y-6">
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('ملاحظات المراجعة السريعة', 'Quick Revision Notes')}
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {contentLang === 'en' && lesson.revisionNotesEn
                ? lesson.revisionNotesEn
                : lesson.revisionNotesAr}
            </p>
          </section>

          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('تدريبات الكتاب المدرسي والحلول النموذجية', 'Curriculum Exercises & Model Solutions')}
            </h2>
            {exercises.map((ex, i) => (
              <div key={i} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {i + 1}. {ex.question}
                </div>
                {ex.hint && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {t('تلميح:', 'Hint:')} {ex.hint}
                  </div>
                )}
                <button
                  onClick={() => setRevealedAnswers((prev) => ({ ...prev, [i]: !prev[i] }))}
                  className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline"
                >
                  {revealedAnswers[i]
                    ? t('إخفاء الإجابة النموذجية', 'Hide Model Answer')
                    : t('عرض الإجابة النموذجية', 'Show Model Answer')}
                </button>
                {revealedAnswers[i] && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200">
                    {ex.answer}
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
      )}

      {/* Tab 4: Real Gemini RAG Lesson Summarizer */}
      {activeTab === 'ai_summary' && (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Sparkles className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
              <h2>{t('تلخيص الدرس بالذكاء الاصطناعي المرتبط بالمنهج (RAG)', 'Curriculum-Grounded AI Lesson Summarizer')}</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t(
                'اختر نمط التلخيص المطلوب ليقوم المساعد الذكي بتوليده اعتماداً على نص هذا الدرس مع ذكر المصدر الرسمي.',
                'Select any summary format below. Gemini generates a grounded study guide citing this exact Egyptian curriculum lesson.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUMMARY_MODES.map((m) => (
              <button
                key={m.id}
                disabled={summaryLoading}
                onClick={() => handleGenerateSummary(m.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  summaryMode === m.id && summaryResult
                    ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {lang === 'ar' ? m.ar : m.en}
              </button>
            ))}
          </div>

          {summaryLoading && (
            <div className="py-12 flex items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-[#0E5A6D]" />
              <span>{t('جاري تحليل الدرس وتوليد الملخص الموثق...', 'Analyzing official lesson content and generating summary...')}</span>
            </div>
          )}

          {summaryError && (
            <div className="p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {summaryError}
            </div>
          )}

          {summaryResult && !summaryLoading && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="study-prose text-sm sm:text-base text-slate-800 dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summaryResult.contentMarkdown}
                </ReactMarkdown>
              </div>
              {summaryResult.citations.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                    {t('المصادر المستشهد بها:', 'Cited Curriculum Sources:')}
                  </div>
                  {summaryResult.citations.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>{c.title}</span>
                      {' · '}
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline text-[#0E5A6D] dark:text-[#4DD0E1]">
                        {c.sourceUrl}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Previously Saved Summaries for this lesson */}
          {data.savedSummaries.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {t('ملخصاتك المحفوظة سابقاً لهذا الدرس', 'Your Previously Saved Summaries')}
              </h3>
              <div className="space-y-2">
                {data.savedSummaries.map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      setSummaryResult({
                        contentMarkdown: s.contentMarkdown,
                        citations: [],
                      })
                    }
                    className="w-full text-start px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {s.summaryType} ({s.language.toUpperCase()})
                    </span>
                    <span className="font-mono text-slate-400">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

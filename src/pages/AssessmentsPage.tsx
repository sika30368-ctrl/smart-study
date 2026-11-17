import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  InteractivePracticeModal,
  PracticeExamPayload,
} from '../components/InteractivePracticeModal';

const BANNER_IMG = '/src/assets/images/moe_assessments_banner_1794931541870.jpg';

interface AssessmentItem {
  id: number;
  titleAr: string;
  titleEn: string;
  gradeCode: string;
  subjectCode: string;
  academicYear: string;
  semester: number;
  periodLabelAr: string;
  periodLabelEn: string;
  assessmentType: string;
  officialSourceUrl: string;
  sourceDomain: string;
  isOfficialVerified: boolean;
  localFilePath: string | null;
  publicationDate: string;
  descriptionAr: string;
  descriptionEn: string;
  practiceQuestionsJson: {
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
  }[];
}

const ASSESSMENT_TYPES = [
  { id: 'all', ar: 'الكل', en: 'All Types' },
  { id: 'weekly', ar: 'تقييم أسبوعي', en: 'Weekly' },
  { id: 'monthly', ar: 'تقييم شهري', en: 'Monthly' },
  { id: 'general', ar: 'تقييم عام', en: 'General' },
  { id: 'model_exam', ar: 'نموذج استرشادي', en: 'Model Exam' },
  { id: 'revision', ar: 'مراجعة نهائية', en: 'Revision' },
  { id: 'question_bank', ar: 'بنك أسئلة', en: 'Question Bank' },
];

export const AssessmentsPage: React.FC = () => {
  const { lang, t, grades, academicYears, selectedGrade, authFetch } = useApp();
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');

  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerFailed, setBannerFailed] = useState(false);

  // Online Document / PDF Viewer Modal
  const [viewingDoc, setViewingDoc] = useState<AssessmentItem | null>(null);

  // Interactive Practice Runner
  const [activePractice, setActivePractice] = useState<PracticeExamPayload | null>(null);
  const [generatingForId, setGeneratingForId] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState<string>('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (gradeFilter !== 'all') qs.set('grade', gradeFilter);
    if (semesterFilter !== 'all') qs.set('semester', semesterFilter);
    if (typeFilter !== 'all') qs.set('type', typeFilter);
    if (yearFilter !== 'all') qs.set('year', yearFilter);

    fetch(`/api/assessments?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => active && setItems(d.assessments ?? []))
      .catch((err) => console.error('Assessments fetch failed:', err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [gradeFilter, semesterFilter, typeFilter, yearFilter]);

  const launchBuiltInPractice = (item: AssessmentItem) => {
    const questions = item.practiceQuestionsJson.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: lang === 'ar' ? q.questionAr : q.questionEn,
      options: lang === 'ar' ? q.optionsAr : q.optionsEn,
      points: 2,
    }));
    const answerKey = item.practiceQuestionsJson.map((q) => ({
      id: q.id,
      correctAnswer: lang === 'ar' ? q.correctAnswerAr : q.correctAnswerEn,
      explanation: lang === 'ar' ? q.explanationAr : q.explanationEn,
      curriculumReference: `${lang === 'ar' ? item.titleAr : item.titleEn} (${item.sourceDomain})`,
    }));

    setActivePractice({
      examTitle: lang === 'ar' ? `تدريب تفاعلي: ${item.titleAr}` : `Interactive Practice: ${item.titleEn}`,
      isPracticeSimulation: true,
      basedOnOfficialAssessment: {
        id: item.id,
        titleAr: item.titleAr,
        titleEn: item.titleEn,
        officialSourceUrl: item.officialSourceUrl,
      },
      questions,
      answerKey,
    });
  };

  const generateExpandedAiPractice = async (item: AssessmentItem) => {
    setGeneratingForId(item.id);
    setPracticeError('');
    try {
      const res = await authFetch(`/api/assessments/${item.id}/practice-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: lang,
          difficulty: 'medium',
          questionCount: 6,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate practice assessment');
      setActivePractice(json);
    } catch (err: any) {
      console.error('Failed to generate expanded practice:', err);
      setPracticeError(
        err.message ||
          t(
            'تعذر إنشاء المحاكاة بالذكاء الاصطناعي حالياً. يمكنك استخدام "تدريب سريع" فوراً.',
            'Could not generate AI practice right now. You can use Quick Practice immediately.'
          )
      );
    } finally {
      setGeneratingForId(null);
    }
  };

  const gradeName = (code: string) => {
    const g = grades.find((x) => x.code === code);
    return g ? (lang === 'ar' ? g.nameAr : g.nameEn) : code;
  };

  const typeName = (type: string) => {
    const found = ASSESSMENT_TYPES.find((x) => x.id === type);
    return found ? (lang === 'ar' ? found.ar : found.en) : type;
  };

  return (
    <div className="space-y-6">
      {/* Institutional Banner */}
      <section className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[200px] flex items-end">
        {!bannerFailed && (
          <img
            src={BANNER_IMG}
            alt={t('تقييمات وزارة التربية والتعليم', 'Official Ministry of Education Assessments')}
            referrerPolicy="no-referrer"
            onError={() => setBannerFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-slate-950/20" />
        <div className="relative z-10 p-6 sm:p-8 max-w-3xl space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {t('مصدر موثق من بوابة وزارة التربية والتعليم (studentbooks.moe.gov.eg)', 'Verified Egyptian Ministry of Education Portal (studentbooks.moe.gov.eg)')}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {t('تقييمات وزارة التربية والتعليم', 'Official Ministry Assessments')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
            {t(
              'التقييمات الأسبوعية والشهرية، النماذج الاسترشادية، والمراجعات الرسمية محفوظة دون تعديل مع إتاحة وضع التدريب التفاعلي (اختيار من متعدد، صواب وخطأ، أكمل، ومقالي) مفصولاً بوضوح عن الامتحان الرسمي.',
              'Weekly & monthly assessments, model exams, and official revision sheets preserved unaltered from moe.gov.eg, plus interactive practice simulations (MCQ, True/False, Fill-in-the-blanks, Written) clearly distinguished from official exams.'
            )}
          </p>
        </div>
      </section>

      {/* Filters Toolbar */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t('الصف الدراسي', 'Grade')}
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              <option value="all">{t('جميع الصفوف (١ إعدادي — ٣ ثانوي)', 'All Grades (Prep 1 – Sec 3)')}</option>
              <option value={selectedGrade}>
                {t('صفي الحالي:', 'My Current Grade:')} {gradeName(selectedGrade)}
              </option>
              {grades.map((g) => (
                <option key={g.code} value={g.code}>
                  {lang === 'ar' ? g.nameAr : g.nameEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t('الفصل الدراسي', 'Semester')}
            </label>
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              <option value="all">{t('الفصلان الدراسيان', 'Both Semesters')}</option>
              <option value="1">{t('الفصل الدراسي الأول', 'First Semester')}</option>
              <option value="2">{t('الفصل الدراسي الثاني', 'Second Semester')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
              {t('العام الدراسي', 'Academic Year')}
            </label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              <option value="all">{t('جميع الأعوام', 'All Years')}</option>
              {academicYears.map((y) => (
                <option key={y.code} value={y.code}>
                  {lang === 'ar' ? y.labelAr : y.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <a
              href="https://studentbooks.moe.gov.eg/Performance_Assessments/"
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#0E5A6D] text-[#0E5A6D] dark:border-[#22A6B3] dark:text-[#4DD0E1] hover:bg-[#0E5A6D]/5 text-xs font-semibold whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t('فتح بوابة الوزارة مباشرة', 'Open moe.gov.eg Portal')}</span>
            </a>
          </div>
        </div>

        {/* Assessment Type Segmented Filter */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {ASSESSMENT_TYPES.map((tp) => (
            <button
              key={tp.id}
              onClick={() => setTypeFilter(tp.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                typeFilter === tp.id
                  ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {lang === 'ar' ? tp.ar : tp.en}
            </button>
          ))}
        </div>
      </section>

      {practiceError && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex items-start justify-between gap-3 text-xs sm:text-sm text-amber-950 dark:text-amber-200">
          <span>{practiceError}</span>
          <button onClick={() => setPracticeError('')} className="p-1 shrink-0" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Assessments List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t('لا توجد تقييمات مطابقة لخيارات التصفية.', 'No assessments match the selected filters.')}
          </p>
          <button
            onClick={() => {
              setGradeFilter('all');
              setSemesterFilter('all');
              setTypeFilter('all');
              setYearFilter('all');
            }}
            className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline"
          >
            {t('إعادة ضبط الفلاتر', 'Reset filters')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {gradeName(item.gradeCode)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{typeName(item.assessmentType)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lang === 'ar' ? item.periodLabelAr : item.periodLabelEn}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{item.publicationDate}</span>
                  <span aria-hidden="true">·</span>
                  {item.isOfficialVerified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{t(`مصدر رسمي (${item.sourceDomain})`, `Official (${item.sourceDomain})`)}</span>
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                      {t('مرفوع عبر الإدارة — غير موثّق بنطاق الوزارة', 'Admin Uploaded — Non-MOE Domain')}
                    </span>
                  )}
                </div>

                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ar' ? item.titleAr : item.titleEn}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                  {lang === 'ar' ? item.descriptionAr : item.descriptionEn}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => setViewingDoc(item)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{t('معاينة أونلاين', 'View Online')}</span>
                </button>

                <a
                  href={item.localFilePath || item.officialSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={item.localFilePath ? true : undefined}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{item.localFilePath ? t('تحميل PDF', 'Download PDF') : t('رابط الوزارة', 'Official Portal')}</span>
                </a>

                {item.practiceQuestionsJson.length > 0 && (
                  <button
                    onClick={() => launchBuiltInPractice(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] dark:bg-[#1A7D94] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>{t('تدريب سريع', 'Quick Practice')}</span>
                  </button>
                )}

                <button
                  disabled={generatingForId === item.id}
                  onClick={() => generateExpandedAiPractice(item)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 text-xs font-semibold whitespace-nowrap"
                >
                  {generatingForId === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {generatingForId === item.id
                      ? t('جاري تجهيز التدريب...', 'Building Practice...')
                      : t('محاكاة كاملة (4 أنماط)', 'Full Practice (4 Types)')}
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Online PDF / Official Assessment Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  {viewingDoc.isOfficialVerified
                    ? t('وثيقة رسمية من وزارة التربية والتعليم — غير معدّلة', 'Unaltered Official Ministry Document Reference')
                    : t('مستند تعليمي', 'Educational Document')}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {lang === 'ar' ? viewingDoc.titleAr : viewingDoc.titleEn}
                </h3>
              </div>
              <button
                onClick={() => setViewingDoc(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {viewingDoc.localFilePath ? (
                <iframe
                  src={viewingDoc.localFilePath}
                  title={viewingDoc.titleEn}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
                />
              ) : (
                <div className="space-y-5 max-w-2xl mx-auto py-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <FileText className="w-5 h-5 text-[#0E5A6D] dark:text-[#4DD0E1] shrink-0 mt-0.5" />
                    <div className="text-xs sm:text-sm space-y-2">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {t('رابط الوثيقة الرسمية على بوابة وزارة التربية والتعليم', 'Official Ministry Portal Resource')}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                        {t(
                          'تستضيف وزارة التربية والتعليم ملفات PDF الأصلية مباشرة على بوابة المكتبة الإلكترونية (studentbooks.moe.gov.eg) ولا تسمح بتضمينها داخل إطارات خارجية. يمكنك فتح المصدر الرسمي مباشرة أو رفع نسخة PDF محلياً من لوحة الإدارة.',
                          'The Egyptian Ministry hosts original PDFs on studentbooks.moe.gov.eg (which blocks third-party iframe embedding). Open the verified official portal directly below, or upload the official PDF via Admin Panel for embedded viewing.'
                        )}
                      </p>
                      <div className="pt-1 flex flex-wrap gap-2">
                        <a
                          href={viewingDoc.officialSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0E5A6D] text-white text-xs font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{t('فتح صفحة الوزارة الأصلية', 'Open Official moe.gov.eg Page')}</span>
                        </a>
                        <button
                          onClick={() => {
                            const doc = viewingDoc;
                            setViewingDoc(null);
                            generateExpandedAiPractice(doc);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>{t('بدء المحاكاة التدريبية التفاعلية', 'Start Interactive Practice Simulation')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Practice Assessment Runner */}
      {activePractice && (
        <InteractivePracticeModal exam={activePractice} onClose={() => setActivePractice(null)} />
      )}
    </div>
  );
};

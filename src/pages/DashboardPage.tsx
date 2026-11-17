import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const HERO_IMG = '/src/assets/images/hero_egypt_study_1794931541004.jpg';

interface DashboardData {
  gradeCode: string;
  academicYear: string;
  stats: {
    totalSubjects: number;
    totalLessons: number;
    completedLessons: number;
    completionPercent: number;
    savedSummariesCount: number;
    practiceExamsCount: number;
    aiSessionsCount: number;
  };
  subjects: {
    id: number;
    code: string;
    nameAr: string;
    nameEn: string;
    track: string;
    languageTrack: string;
    descriptionAr: string;
    descriptionEn: string;
    totalLessons: number;
    completedLessons: number;
    progressPercent: number;
  }[];
  upcomingAssessments: {
    id: number;
    titleAr: string;
    titleEn: string;
    assessmentType: string;
    periodLabelAr: string;
    periodLabelEn: string;
    publicationDate: string;
    officialSourceUrl: string;
    isOfficialVerified: boolean;
  }[];
  savedSummaries: {
    id: number;
    lessonId: number;
    summaryType: string;
    language: string;
    contentMarkdown: string;
    createdAt: string;
  }[];
  recentConversations: {
    id: number;
    mode: string;
    title: string;
    subjectCode: string;
    updatedAt: string;
  }[];
  weakTopics: {
    lessonId: number;
    titleAr: string;
    titleEn: string;
    masteryScore: number;
  }[];
  recommendedLessons: {
    lessonId: number;
    titleAr: string;
    titleEn: string;
    subjectCode: string;
    subjectNameAr: string;
    subjectNameEn: string;
  }[];
}

export const DashboardPage: React.FC = () => {
  const { lang, t, grades, selectedGrade, setSelectedGrade, selectedYear, authFetch, firebaseUser, signInWithGoogle } =
    useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const DirArrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  useEffect(() => {
    let active = true;
    setLoading(true);
    authFetch(`/api/student/dashboard?grade=${encodeURIComponent(selectedGrade)}&year=${encodeURIComponent(selectedYear)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active) setData(json);
      })
      .catch((err) => console.error('Dashboard fetch error:', err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedGrade, selectedYear, firebaseUser, authFetch]);

  const currentGrade = grades.find((g) => g.code === selectedGrade);

  return (
    <div className="space-y-8">
      {/* Editorial Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div>
            <div className="text-xs font-medium text-[#0E5A6D] dark:text-[#4DD0E1] mb-2">
              {t('المنصة التعليمية المصرية المتكاملة', 'Complete Egyptian Education Platform')}
              {' · '}
              <span className="font-mono tabular-nums">{selectedYear}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight mb-3">
              {currentGrade
                ? lang === 'ar'
                  ? `منهج ${currentGrade.nameAr}`
                  : `${currentGrade.nameEn} Workspace`
                : t('ابدأ رحلتك الدراسية الذكية', 'Your Egyptian Study Workspace')}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {t(
                'مناهج وزارة التربية والتعليم للمرحلتين الإعدادية والثانوية، التقييمات الرسمية الأسبوعية والشهرية، ومساعد ذكي مرتبط مباشرة بدروس المنهج الرسمي باللغتين العربية والإنجليزية.',
                'Official Egyptian Preparatory and Secondary curricula, Ministry performance assessments, and a curriculum-grounded AI tutor in Arabic and English.'
              )}
            </p>
          </div>

          {/* Quick Grade Selector Bar */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {grades.map((g) => (
                <button
                  key={g.code}
                  onClick={() => setSelectedGrade(g.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    selectedGrade === g.code
                      ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {lang === 'ar' ? g.shortAr : g.shortEn}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/curriculum"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] dark:bg-[#1A7D94] text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>{t('استعراض المناهج الدراسية', 'Browse Curricula')}</span>
              </Link>
              <Link
                to="/ai-studio"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
                <span>{t('المساعد الذكي وحل المسائل', 'AI Tutor & Problem Solver')}</span>
              </Link>
              <Link
                to="/assessments"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>{t('تقييمات الوزارة', 'Ministry Assessments')}</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 relative min-h-[220px] bg-slate-100 dark:bg-slate-900">
          {!heroImgFailed ? (
            <img
              src={HERO_IMG}
              alt={t('بيئة دراسية مصرية حديثة', 'Modern Egyptian academic study hall')}
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 text-slate-400">
              <BookOpen className="w-12 h-12" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent flex items-end p-5">
            <div className="text-xs text-white/90 font-medium">
              {t('مرجع معتمد من بوابة وزارة التربية والتعليم المصرية (moe.gov.eg)', 'Aligned with Egyptian Ministry of Education Portals (moe.gov.eg)')}
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column Tabular KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {t('المواد الدراسية للصف', 'Grade Subjects')}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading ? '—' : data?.stats.totalSubjects ?? 0}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {data?.stats.totalLessons ?? 0} {t('درس متاح محلياً', 'lessons stored locally')}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {t('تقدم المذاكرة', 'Study Progress')}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0E5A6D] dark:text-[#4DD0E1]">
            {loading ? '—' : `${data?.stats.completionPercent ?? 0}%`}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {data?.stats.completedLessons ?? 0} / {data?.stats.totalLessons ?? 0}{' '}
            {t('دروس مكتملة', 'completed')}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {t('الملخصات المحفوظة', 'Saved AI Summaries')}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading ? '—' : data?.stats.savedSummariesCount ?? 0}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {firebaseUser
              ? t('مربوطة بحسابك الشخصي', 'Synced to your account')
              : t('سجل الدخول لحفظ الملخصات', 'Sign in to save summaries')}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {t('الاختبارات التدريبية والمحادثات', 'Practice Exams & AI Chats')}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {loading
              ? '—'
              : (data?.stats.practiceExamsCount ?? 0) + (data?.stats.aiSessionsCount ?? 0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {data?.stats.practiceExamsCount ?? 0} {t('اختبار', 'exams')} · {data?.stats.aiSessionsCount ?? 0}{' '}
            {t('جلسة ذكاء اصطناعي', 'AI sessions')}
          </div>
        </div>
      </section>

      {/* Sign-in Prompt Banner for Guests (subtle, non-intrusive) */}
      {!firebaseUser && (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t('احفظ تقدمك الدراسي وملخصاتك عبر حساب Google', 'Save your study progress, summaries, and practice exams')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t(
                'يمكنك تصفح المناهج والتقييمات الآن، وسجّل الدخول لحفظ الدروس المكتملة والموضوعات الضعيفة وتاريخ المساعد الذكي في قاعدة البيانات.',
                'Browse all curricula freely now, or sign in with Google to persist completed lessons, weak topics, and AI tutoring history.'
              )}
            </p>
          </div>
          <button
            onClick={signInWithGoogle}
            className="px-4 py-2 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {t('تسجيل الدخول الآن', 'Sign in with Google')}
          </button>
        </section>
      )}

      {/* Subjects Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t('المواد الدراسية لهذا الصف', 'Subjects for This Grade')}
          </h2>
          <Link
            to="/curriculum"
            className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline flex items-center gap-1 whitespace-nowrap"
          >
            <span>{t('عرض كل المراحل', 'All Stages')}</span>
            <DirArrow className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data?.subjects ?? []).map((sub) => (
              <Link
                key={sub.code}
                to={`/curriculum/${sub.code}`}
                className="group bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#0E5A6D] dark:hover:border-[#22A6B3] rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors"
              >
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    {sub.languageTrack === 'arabic_and_english'
                      ? t('عربي وإنجليزي رسمي', 'Official AR & EN')
                      : sub.languageTrack === 'english_only'
                      ? t('منهج اللغة الإنجليزية', 'English Curriculum')
                      : t('منهج عربي رسمي', 'Official Arabic Only')}
                    {' · '}
                    <span className="tabular-nums">
                      {sub.totalLessons} {t('دروس', 'lessons')}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#0E5A6D] dark:group-hover:text-[#4DD0E1] transition-colors">
                    {lang === 'ar' ? sub.nameAr : sub.nameEn}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {lang === 'ar' ? sub.descriptionAr : sub.descriptionEn}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('الإنجاز', 'Progress')}
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                      {sub.progressPercent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-[#0E5A6D] dark:bg-[#22A6B3] transition-all"
                      style={{ width: `${sub.progressPercent}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Lower Two-Column Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upcoming Official Ministry Assessments */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {t('تقييمات وزارة التربية والتعليم لهذا الصف', 'Official Ministry Assessments for Your Grade')}
            </h2>
            <Link
              to="/assessments"
              className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline whitespace-nowrap"
            >
              {t('عرض الكل', 'View All')}
            </Link>
          </div>

          {(data?.upcomingAssessments ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              {t('لا توجد تقييمات مضافة لهذا الصف بعد. تصفح قسم التقييمات الرسمية.', 'No assessments listed for this grade yet. Visit the Ministry Assessments page.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data?.upcomingAssessments ?? []).map((a) => (
                <div key={a.id} className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                      {lang === 'ar' ? a.periodLabelAr : a.periodLabelEn}
                      {' · '}
                      <span className="font-mono tabular-nums">{a.publicationDate}</span>
                      {' · '}
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {a.isOfficialVerified ? t('مصدر رسمي موثّق', 'Verified MOE Source') : t('تقييم تدريبي', 'Practice')}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'ar' ? a.titleAr : a.titleEn}
                    </div>
                  </div>
                  <Link
                    to="/assessments"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    {t('فتح', 'Open')}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Lessons, Weak Topics & Recent AI Activity */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3.5">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <TrendingUp className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
              <h2>{t('الدروس المقترحة للمذاكرة الآن', 'Recommended Next Lessons')}</h2>
            </div>

            {(data?.recommendedLessons ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('رائع! أتممت جميع الدروس الحالية لهذا الصف.', 'Great job! You completed all lessons in this grade.')}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.recommendedLessons ?? []).map((rec) => (
                  <Link
                    key={rec.lessonId}
                    to={`/lesson/${rec.lessonId}`}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {lang === 'ar' ? rec.subjectNameAr : rec.subjectNameEn}
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-[#0E5A6D] dark:group-hover:text-[#4DD0E1] truncate">
                        {lang === 'ar' ? rec.titleAr : rec.titleEn}
                      </div>
                    </div>
                    <DirArrow className="w-4 h-4 text-slate-400 shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {(data?.weakTopics ?? []).length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                  {t('موضوعات تحتاج لمراجعة إضافية', 'Topics Needing Review')}
                </div>
                <div className="space-y-1.5">
                  {data!.weakTopics.map((w) => (
                    <Link
                      key={w.lessonId}
                      to={`/lesson/${w.lessonId}`}
                      className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 hover:underline"
                    >
                      <span className="truncate">{lang === 'ar' ? w.titleAr : w.titleEn}</span>
                      <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {w.masteryScore}%
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <MessageSquare className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
                <h3>{t('أحدث محادثاتك وملخصاتك', 'Recent AI Chats & Summaries')}</h3>
              </div>
              <Link to="/ai-studio" className="text-xs text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline">
                {t('فتح المساعد', 'Open AI')}
              </Link>
            </div>

            {(data?.recentConversations ?? []).length === 0 && (data?.savedSummaries ?? []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'ابدأ محادثة مع المدرس الذكي أو أنشئ ملخصاً لأي درس ليظهر هنا.',
                  'Start a session with the AI Study Tutor or summarize any lesson to see it here.'
                )}
              </p>
            ) : (
              <div className="space-y-2.5 text-xs">
                {(data?.savedSummaries ?? []).slice(0, 3).map((s) => (
                  <Link
                    key={`sum-${s.id}`}
                    to={`/lesson/${s.lessonId}`}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                  >
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200 truncate">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {t('ملخص درس', 'Lesson Summary')} ({s.summaryType})
                      </span>
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </Link>
                ))}
                {(data?.recentConversations ?? []).slice(0, 3).map((c) => (
                  <Link
                    key={`chat-${c.id}`}
                    to="/ai-studio"
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                  >
                    <span className="text-slate-700 dark:text-slate-200 truncate">{c.title}</span>
                    <span className="text-slate-400 shrink-0">
                      {c.mode === 'problem_solver' ? t('حل مسألة', 'Solver') : t('معلم ذكي', 'Tutor')}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

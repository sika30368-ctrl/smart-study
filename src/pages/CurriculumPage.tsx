import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  History,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const PREP_IMG = '/src/assets/images/stage_preparatory_card_1794931541669.jpg';
const SEC_IMG = '/src/assets/images/stage_secondary_card_1794931541731.jpg';

interface SubjectSummary {
  id: number;
  code: string;
  gradeCode: string;
  nameAr: string;
  nameEn: string;
  track: string;
  languageTrack: string;
  academicYear: string;
  descriptionAr: string;
  descriptionEn: string;
  officialBookUrlAr: string;
  officialBookUrlEn: string | null;
  unitsCount: number;
  lessonsCount: number;
  semesters: number[];
}

interface SubjectDetailData {
  subject: SubjectSummary;
  units: {
    id: number;
    semester: number;
    orderIndex: number;
    titleAr: string;
    titleEn: string;
    descriptionAr: string;
    descriptionEn: string;
    lessons: {
      id: number;
      chapterAr: string;
      chapterEn: string;
      titleAr: string;
      titleEn: string;
      isOfficialEn: boolean;
      publishedDate: string;
      versionNumber: number;
      completed: boolean;
    }[];
  }[];
  assessments: {
    id: number;
    titleAr: string;
    titleEn: string;
    assessmentType: string;
    periodLabelAr: string;
    periodLabelEn: string;
    publicationDate: string;
  }[];
  versions: {
    id: number;
    versionLabel: string;
    documentTitle: string;
    status: string;
    publishedAt: string | null;
    createdAt: string;
  }[];
}

export const CurriculumPage: React.FC = () => {
  const { subjectCode } = useParams();
  const {
    lang,
    t,
    grades,
    selectedGrade,
    setSelectedGrade,
    selectedTrack,
    setSelectedTrack,
    authFetch,
    syncCurriculumLocally,
    syncingLocal,
    localSyncTime,
  } = useApp();

  const [subjectsList, setSubjectsList] = useState<SubjectSummary[]>([]);
  const [detail, setDetail] = useState<SubjectDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [semesterFilter, setSemesterFilter] = useState<'all' | 1 | 2>('all');
  const [prepImgErr, setPrepImgErr] = useState(false);
  const [secImgErr, setSecImgErr] = useState(false);

  const DirArrow = lang === 'ar' ? ArrowLeft : ArrowRight;
  const BackArrow = lang === 'ar' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let active = true;
    setLoading(true);
    if (subjectCode) {
      authFetch(`/api/curriculum/subjects/${encodeURIComponent(subjectCode)}`)
        .then((r) => r.json())
        .then((d) => {
          if (active) setDetail(d.subject ? d : null);
        })
        .catch((err) => console.error('Subject detail error:', err))
        .finally(() => active && setLoading(false));
    } else {
      const qs = new URLSearchParams();
      if (selectedGrade) qs.set('grade', selectedGrade);
      if (selectedTrack && selectedTrack !== 'all') qs.set('track', selectedTrack);
      fetch(`/api/curriculum/subjects?${qs.toString()}`)
        .then((r) => r.json())
        .then((d) => {
          if (active) setSubjectsList(d.subjects ?? []);
        })
        .catch((err) => console.error('Subjects list error:', err))
        .finally(() => active && setLoading(false));
    }
    return () => {
      active = false;
    };
  }, [subjectCode, selectedGrade, selectedTrack, authFetch]);

  // Subject Detail View
  if (subjectCode) {
    if (loading) {
      return (
        <div className="space-y-4">
          <div className="h-32 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-64 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>
      );
    }

    if (!detail) {
      return (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            {t('المادة المطلوبة غير موجودة.', 'Requested subject was not found.')}
          </p>
          <Link to="/curriculum" className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline">
            {t('العودة إلى المناهج', 'Back to Curricula')}
          </Link>
        </div>
      );
    }

    const { subject, units, versions } = detail;
    const visibleUnits = units.filter((u) => semesterFilter === 'all' || u.semester === semesterFilter);

    return (
      <div className="space-y-6">
        <Link
          to="/curriculum"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <BackArrow className="w-3.5 h-3.5" />
          <span>{t('العودة إلى جميع المواد', 'Back to All Subjects')}</span>
        </Link>

        {/* Subject Header */}
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {subject.gradeCode.toUpperCase()}
              {' · '}
              <span className="font-mono tabular-nums">{subject.academicYear}</span>
              {' · '}
              {subject.languageTrack === 'arabic_and_english'
                ? t('نسخة عربية وإنجليزية رسمية', 'Official Arabic & English Editions')
                : subject.languageTrack === 'english_only'
                ? t('منهج اللغة الإنجليزية الرسمي', 'Official English Curriculum')
                : t('نسخة عربية رسمية فقط', 'Official Arabic Edition Only')}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {lang === 'ar' ? subject.nameAr : subject.nameEn}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar' ? subject.descriptionAr : subject.descriptionEn}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href={subject.officialBookUrlAr}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] dark:bg-[#1A7D94] text-white text-xs font-semibold whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t('كتاب الوزارة (moe.gov.eg)', 'Official MOE Textbook')}</span>
            </a>
            <Link
              to={`/ai-studio?tab=exam&grade=${subject.gradeCode}&subject=${subject.code}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <span>{t('إنشاء اختبار تدريبي', 'Generate Practice Exam')}</span>
            </Link>
          </div>
        </section>

        {/* Semester Filter Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg">
            {(['all', 1, 2] as const).map((sem) => (
              <button
                key={String(sem)}
                onClick={() => setSemesterFilter(sem)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  semesterFilter === sem
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {sem === 'all'
                  ? t('كل الفصول الدراسية', 'All Semesters')
                  : sem === 1
                  ? t('الفصل الدراسي الأول', 'First Semester')
                  : t('الفصل الدراسي الثاني', 'Second Semester')}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {visibleUnits.length} {t('وحدة دراسية', 'units')}
          </div>
        </div>

        {/* Units & Lessons Accordion/List */}
        <div className="space-y-5">
          {visibleUnits.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
              {t('لا توجد وحدات مضافة لهذا الفصل الدراسي بعد.', 'No units published for this semester filter yet.')}
            </div>
          ) : (
            visibleUnits.map((unit) => (
              <section
                key={unit.id}
                className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    {unit.semester === 1 ? t('الترم الأول', 'Semester 1') : t('الترم الثاني', 'Semester 2')}
                    {' · '}
                    <span className="tabular-nums">
                      {unit.lessons.length} {t('دروس', 'lessons')}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'ar' ? unit.titleAr : unit.titleEn}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {lang === 'ar' ? unit.descriptionAr : unit.descriptionEn}
                  </p>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unit.lessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      to={`/lesson/${lesson.id}`}
                      className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {lesson.completed ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {lang === 'ar' ? lesson.chapterAr : lesson.chapterEn}
                            {' · '}
                            {lesson.isOfficialEn
                              ? t('عربي + إنجليزي رسمي', 'Official AR & EN')
                              : t('عربي رسمي فقط', 'Official AR Only')}
                            {' · '}
                            <span className="font-mono tabular-nums">v{lesson.versionNumber}</span>
                          </div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                            {lang === 'ar' ? lesson.titleAr : lesson.titleEn}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] flex items-center gap-1 whitespace-nowrap shrink-0">
                        <span>{t('دراسة الدرس', 'Study Lesson')}</span>
                        <DirArrow className="w-3.5 h-3.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Version History Log if present */}
        {versions.length > 0 && (
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <History className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
              <h3>{t('سجل إصدارات وتحديثات المنهج', 'Curriculum Version History')}</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {versions.map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{v.versionLabel}</span>
                    {' · '}
                    <span className="text-slate-600 dark:text-slate-400">{v.documentTitle}</span>
                  </div>
                  <div className="font-mono text-slate-500">
                    {v.status} · {new Date(v.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Main Curriculum Catalog View (All 6 Grades)
  const isSecondaryUpper = selectedGrade === 'sec2' || selectedGrade === 'sec3';

  return (
    <div className="space-y-8">
      {/* Stage Visual Cards: Preparatory vs Secondary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="h-44 relative bg-slate-100 dark:bg-slate-900">
            {!prepImgErr && (
              <img
                src={PREP_IMG}
                alt={t('المرحلة الإعدادية', 'Preparatory Stage')}
                referrerPolicy="no-referrer"
                onError={() => setPrepImgErr(true)}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-5">
              <div>
                <div className="text-xs text-slate-200">
                  {t('الصف الأول · الثاني · الثالث الإعدادي', 'Grades 7, 8 & 9 — Egyptian National System')}
                </div>
                <h2 className="text-xl font-bold text-white mt-0.5">
                  {t('المرحلة الإعدادية', 'Preparatory Stage (الإعدادية)')}
                </h2>
              </div>
            </div>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {grades
              .filter((g) => g.stage === 'preparatory')
              .map((g) => (
                <button
                  key={g.code}
                  onClick={() => {
                    setSelectedGrade(g.code);
                    setSelectedTrack('all');
                  }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedGrade === g.code
                      ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'ar' ? g.nameAr : g.nameEn}
                </button>
              ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="h-44 relative bg-slate-100 dark:bg-slate-900">
            {!secImgErr && (
              <img
                src={SEC_IMG}
                alt={t('المرحلة الثانوية', 'Secondary Stage')}
                referrerPolicy="no-referrer"
                onError={() => setSecImgErr(true)}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-5">
              <div>
                <div className="text-xs text-slate-200">
                  {t('الأول · الثاني · الثالث الثانوي (علمي وأدبي)', 'Grades 10, 11 & 12 — Thanawiya Amma Tracks')}
                </div>
                <h2 className="text-xl font-bold text-white mt-0.5">
                  {t('المرحلة الثانوية العامة', 'Secondary Stage (الثانوية العامة)')}
                </h2>
              </div>
            </div>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {grades
              .filter((g) => g.stage === 'secondary')
              .map((g) => (
                <button
                  key={g.code}
                  onClick={() => setSelectedGrade(g.code)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedGrade === g.code
                      ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {lang === 'ar' ? g.nameAr : g.nameEn}
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* Filter Bar & Local Sync Info */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {(() => {
              const g = grades.find((x) => x.code === selectedGrade);
              return g ? (lang === 'ar' ? g.nameAr : g.nameEn) : t('المواد الدراسية', 'Subjects');
            })()}
          </h1>

          {isSecondaryUpper && (
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
              {[
                { id: 'all', ar: 'كل الشعب', en: 'All Tracks' },
                { id: 'scientific_science', ar: 'علمي علوم', en: 'Sci. Science' },
                { id: 'scientific_math', ar: 'علمي رياضة', en: 'Sci. Math' },
                { id: 'literary', ar: 'أدبي', en: 'Literary' },
              ].map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => setSelectedTrack(tr.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedTrack === tr.id
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {lang === 'ar' ? tr.ar : tr.en}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={syncCurriculumLocally}
          disabled={syncingLocal}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncingLocal ? 'animate-spin' : ''}`} />
          <span>
            {localSyncTime
              ? t('تحديث النسخة المحلية', 'Refresh Local Cache')
              : t('حفظ المناهج محلياً', 'Cache Curricula Locally')}
          </span>
        </button>
      </section>

      {/* Subjects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : subjectsList.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500">
          {t('لا توجد مواد مطابقة لهذه الشعبة حالياً. جرّب اختيار "كل الشعب".', 'No subjects match this track filter. Try selecting All Tracks.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subjectsList.map((sub) => (
            <Link
              key={sub.code}
              to={`/curriculum/${sub.code}`}
              className="group bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#0E5A6D] dark:hover:border-[#22A6B3] rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>
                    {sub.languageTrack === 'arabic_and_english'
                      ? t('عربي + إنجليزي رسمي', 'Official AR & EN')
                      : sub.languageTrack === 'english_only'
                      ? t('إنجليزي رسمي', 'Official EN')
                      : t('عربي رسمي فقط', 'Official AR Only')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {sub.unitsCount} {t('وحدات', 'units')} · {sub.lessonsCount} {t('دروس', 'lessons')}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#0E5A6D] dark:group-hover:text-[#4DD0E1]">
                  {lang === 'ar' ? sub.nameAr : sub.nameEn}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {lang === 'ar' ? sub.descriptionAr : sub.descriptionEn}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1]">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{t('فتح الوحدات والدروس', 'Explore Units & Lessons')}</span>
                </span>
                <DirArrow className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

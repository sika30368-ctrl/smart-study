import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, Loader2, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface SearchLessonHit {
  id: number;
  titleAr: string;
  titleEn: string;
  chapterAr: string;
  chapterEn: string;
  unitTitleAr: string;
  unitTitleEn: string;
  semester: number;
  subjectCode: string;
  subjectNameAr: string;
  subjectNameEn: string;
  gradeCode: string;
  isOfficialEn: boolean;
  snippetAr: string;
  snippetEn: string | null;
  formulasCount: number;
  definitionsCount: number;
}

interface SearchAssessmentHit {
  id: number;
  titleAr: string;
  titleEn: string;
  gradeCode: string;
  assessmentType: string;
  periodLabelAr: string;
  periodLabelEn: string;
  publicationDate: string;
  isOfficialVerified: boolean;
}

export const SearchPage: React.FC = () => {
  const { lang, t, grades, academicYears } = useApp();

  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('all');
  const [semester, setSemester] = useState('all');
  const [year, setYear] = useState('all');

  const [lessons, setLessons] = useState<SearchLessonHit[]>([]);
  const [assessments, setAssessments] = useState<SearchAssessmentHit[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set('q', query.trim());
      if (grade !== 'all') qs.set('grade', grade);
      if (semester !== 'all') qs.set('semester', semester);
      if (year !== 'all') qs.set('year', year);

      const res = await fetch(`/api/search?${qs.toString()}`);
      const json = await res.json();
      setLessons(json.lessons ?? []);
      setAssessments(json.assessments ?? []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      runSearch();
    }, 220);
    return () => clearTimeout(timer);
  }, [query, grade, semester, year]);

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('محرك البحث في المناهج والتقييمات المصرية', 'Bilingual Egyptian Curriculum Search Engine')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            {t(
              'ابحث بالعربية أو الإنجليزية في أسماء الدروس، التعريفات، القوانين الرياضية والعلمية، والاختبارات الرسمية.',
              'Search in Arabic or English across lessons, definitions, formulas, topics, and official Ministry assessments.'
            )}
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              'ابحث مثل: قانون أوم، كيرشوف، كثافة الماء، الذرة، المشتقات، Snell...',
              'Search e.g. Ohm’s Law, Kirchhoff, water density, quantum numbers, كيرشوف...'
            )}
            className="w-full ps-10 pe-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            <option value="all">{t('جميع الصفوف', 'All Grades')}</option>
            {grades.map((g) => (
              <option key={g.code} value={g.code}>
                {lang === 'ar' ? g.nameAr : g.nameEn}
              </option>
            ))}
          </select>

          <select
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            <option value="all">{t('كل الفصول الدراسية', 'All Semesters')}</option>
            <option value="1">{t('الفصل الدراسي الأول', 'First Semester')}</option>
            <option value="2">{t('الفصل الدراسي الثاني', 'Second Semester')}</option>
          </select>

          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            <option value="all">{t('جميع الأعوام الدراسية', 'All Academic Years')}</option>
            {academicYears.map((y) => (
              <option key={y.code} value={y.code}>
                {lang === 'ar' ? y.labelAr : y.labelEn}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loading ? (
        <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('جاري البحث...', 'Searching curriculum database...')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Lessons Results */}
          <section className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
                <span>
                  {t('الدروس والموضوعات والقوانين', 'Lessons, Definitions & Formulas')} ({lessons.length})
                </span>
              </h2>
            </div>

            {lessons.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-slate-500">
                {t('لم يتم العثور على دروس مطابقة لبحثك.', 'No matching lessons found.')}
              </div>
            ) : (
              <div className="space-y-3">
                {lessons.map((hit) => (
                  <Link
                    key={hit.id}
                    to={`/lesson/${hit.id}`}
                    className="block bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#0E5A6D] dark:hover:border-[#22A6B3] rounded-xl p-5 transition-colors"
                  >
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      {lang === 'ar' ? hit.subjectNameAr : hit.subjectNameEn}
                      {' · '}
                      {lang === 'ar' ? hit.unitTitleAr : hit.unitTitleEn}
                      {' · '}
                      <span className="font-mono tabular-nums">
                        {hit.formulasCount} {t('قوانين', 'formulas')} · {hit.definitionsCount}{' '}
                        {t('تعريفات', 'definitions')}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {lang === 'ar' ? hit.titleAr : hit.titleEn}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      {lang === 'en' && hit.snippetEn ? hit.snippetEn : hit.snippetAr}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Assessments Results */}
          <section className="lg:col-span-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-[#0E5A6D] dark:text-[#4DD0E1]" />
              <span>
                {t('تقييمات الوزارة المطابقة', 'Matching Assessments')} ({assessments.length})
              </span>
            </h2>

            {assessments.length === 0 ? (
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-xs text-slate-500">
                {t('لا توجد تقييمات مطابقة.', 'No matching assessments.')}
              </div>
            ) : (
              <div className="space-y-3">
                {assessments.map((a) => (
                  <Link
                    key={a.id}
                    to="/assessments"
                    className="block bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-[#0E5A6D] rounded-xl p-4 transition-colors"
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      {a.gradeCode.toUpperCase()} · {lang === 'ar' ? a.periodLabelAr : a.periodLabelEn} ·{' '}
                      <span className="font-mono">{a.publicationDate}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {lang === 'ar' ? a.titleAr : a.titleEn}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

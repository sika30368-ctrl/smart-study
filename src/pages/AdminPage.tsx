import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FileUp,
  Globe,
  History,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface AdminOverview {
  subjects: { id: number; code: string; gradeCode: string; nameAr: string; nameEn: string; academicYear: string }[];
  versions: {
    id: number;
    subjectId: number;
    versionLabel: string;
    academicYear: string;
    sourceUrl: string;
    documentTitle: string;
    localFilePath: string | null;
    diffSummaryAr: string;
    diffSummaryEn: string;
    changeReportJson: {
      addedTopics: string[];
      modifiedLessons: string[];
      removedChapters: string[];
      extractedLessonsPreview: { titleAr: string; titleEn: string; summaryAr: string }[];
    } | null;
    status: string;
    createdAt: string;
  }[];
  assessments: {
    id: number;
    titleAr: string;
    titleEn: string;
    gradeCode: string;
    sourceDomain: string;
    isOfficialVerified: boolean;
    localFilePath: string | null;
    publicationDate: string;
  }[];
  monitorLogs: {
    id: number;
    targetUrl: string;
    status: string;
    discoveredCount: number;
    discoveredResourcesJson: { title: string; url: string; type: string; discoveredVia: string }[];
    notes: string;
    checkedAt: string;
  }[];
  users: { id: number; uid: string; email: string; displayName: string; role: string; gradeCode: string; createdAt: string }[];
  academicYears: { id: number; code: string; labelAr: string; labelEn: string; isActive: boolean }[];
  auditLogs: { id: number; actorEmail: string; action: string; targetType: string; targetId: string; createdAt: string }[];
}

export const AdminPage: React.FC = () => {
  const { lang, t, profile, firebaseUser, signInWithGoogle, authFetch, grades } = useApp();
  const [tab, setTab] = useState<'moe' | 'versions' | 'assessments' | 'catalog' | 'users'>('moe');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // MOE scan form
  const [scanUrl, setScanUrl] = useState('https://studentbooks.moe.gov.eg/Performance_Assessments/');
  const [scanning, setScanning] = useState(false);

  // Curriculum PDF Upload state
  const [uploadSubjId, setUploadSubjId] = useState<string>('');
  const [uploadVersionLabel, setUploadVersionLabel] = useState('2026-v2');
  const [uploadDocTitle, setUploadDocTitle] = useState('');
  const [uploadSourceUrl, setUploadSourceUrl] = useState('https://studentbooks.moe.gov.eg/');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingCurriculum, setUploadingCurriculum] = useState(false);

  // Assessment Upload state
  const [assTitleAr, setAssTitleAr] = useState('');
  const [assTitleEn, setAssTitleEn] = useState('');
  const [assGrade, setAssGrade] = useState('sec3');
  const [assSubjectCode, setAssSubjectCode] = useState('sec3-physics');
  const [assType, setAssType] = useState('weekly');
  const [assPeriodAr, setAssPeriodAr] = useState('الأسبوع الثالث');
  const [assPeriodEn, setAssPeriodEn] = useState('Week 3');
  const [assUrl, setAssUrl] = useState('https://studentbooks.moe.gov.eg/Performance_Assessments/');
  const [assFile, setAssFile] = useState<File | null>(null);
  const [uploadingAss, setUploadingAss] = useState(false);

  // Add Subject & Academic Year forms
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjGrade, setNewSubjGrade] = useState('sec1');
  const [newSubjAr, setNewSubjAr] = useState('');
  const [newSubjEn, setNewSubjEn] = useState('');
  const [newYearCode, setNewYearCode] = useState('');
  const [newYearAr, setNewYearAr] = useState('');
  const [newYearEn, setNewYearEn] = useState('');

  const loadOverview = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await authFetch('/api/admin/overview');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load admin overview');
      setOverview(json);
      if (json.subjects?.length > 0 && !uploadSubjId) {
        setUploadSubjId(String(json.subjects[0].id));
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadOverview();
    }
  }, [profile]);

  if (!firebaseUser) {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-10 max-w-xl mx-auto text-center space-y-4">
        <ShieldCheck className="w-10 h-10 text-[#0E5A6D] dark:text-[#4DD0E1] mx-auto" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('لوحة التحكم الإدارية محمية بالمصادقة', 'Administrator Sign-In Required')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {t(
            'يرجى تسجيل الدخول بحساب Google المصرّح له لإدارة المناهج ورفع ملفات PDF الرسمية ومراقبة تحديثات وزارة التربية والتعليم.',
            'Sign in with an authorized administrator Google account to manage curricula, upload official PDFs, approve versions, and monitor moe.gov.eg.'
          )}
        </p>
        <button
          onClick={signInWithGoogle}
          className="px-5 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] text-white text-xs font-semibold"
        >
          {t('تسجيل الدخول بحساب Google', 'Sign in with Google')}
        </button>
      </div>
    );
  }

  if (profile && profile.role !== 'admin') {
    return (
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-10 max-w-xl mx-auto text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {t('صلاحيات الطالب فقط', 'Student Account — Admin Access Restricted')}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {t(
            'حسابك الحالي مسجل كطالب. يتطلب الوصول إلى لوحة الإدارة صلاحية مسؤول (Admin) لمنع التعديل غير المصرح به على المناهج الرسمية.',
            'Your current account has Student permissions. Administrator role is required to modify official curricula or approve updates.'
          )}
        </p>
      </div>
    );
  }

  const handleMoeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await authFetch('/api/admin/moe-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: scanUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatusMessage(
        t(
          `اكتمل فحص بوابة الوزارة وتم العثور على ${json.discovered?.length ?? 0} موارد رسمية.`,
          `MOE portal check completed: ${json.discovered?.length ?? 0} official resources discovered.`
        )
      );
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleUploadCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadSubjId) return;
    setUploadingCurriculum(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const fd = new FormData();
      fd.append('subjectId', uploadSubjId);
      fd.append('versionLabel', uploadVersionLabel);
      fd.append('documentTitle', uploadDocTitle || uploadFile.name);
      fd.append('sourceUrl', uploadSourceUrl);
      fd.append('file', uploadFile);

      const res = await authFetch('/api/admin/upload-curriculum', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatusMessage(
        t(
          'تم استخراج النص ومقارنة التغييرات وإضافة الإصدار في قائمة انتظار الاعتماد (لم يتم استبدال المنهج الحالي تلقائياً).',
          'Document extracted and diffed! New curriculum version queued for manual Admin Approval (current curriculum untouched).'
        )
      );
      setUploadFile(null);
      setUploadDocTitle('');
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setUploadingCurriculum(false);
    }
  };

  const handleVersionAction = async (id: number, action: 'approve' | 'reject') => {
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await authFetch(`/api/admin/versions/${id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatusMessage(
        action === 'approve'
          ? t('تم اعتماد الإصدار ونشر الدروس المحدثة للطلاب.', 'Version approved and published to students.')
          : t('تم رفض الإصدار وحفظه في السجل.', 'Version rejected and logged.')
      );
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleUploadAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadingAss(true);
    setStatusMessage('');
    setErrorMessage('');
    try {
      const fd = new FormData();
      fd.append('titleAr', assTitleAr);
      fd.append('titleEn', assTitleEn || assTitleAr);
      fd.append('gradeCode', assGrade);
      fd.append('subjectCode', assSubjectCode);
      fd.append('assessmentType', assType);
      fd.append('periodLabelAr', assPeriodAr);
      fd.append('periodLabelEn', assPeriodEn);
      fd.append('officialSourceUrl', assUrl);
      if (assFile) fd.append('file', assFile);

      const res = await authFetch('/api/admin/upload-assessment', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatusMessage(t('تمت إضافة التقييم الرسمي بنجاح.', 'Assessment added successfully.'));
      setAssTitleAr('');
      setAssTitleEn('');
      setAssFile(null);
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setUploadingAss(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/admin/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newSubjCode,
          gradeCode: newSubjGrade,
          nameAr: newSubjAr,
          nameEn: newSubjEn,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNewSubjCode('');
      setNewSubjAr('');
      setNewSubjEn('');
      setStatusMessage(t('تمت إضافة المادة الدراسية.', 'Subject created.'));
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/admin/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newYearCode, labelAr: newYearAr, labelEn: newYearEn }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNewYearCode('');
      setNewYearAr('');
      setNewYearEn('');
      setStatusMessage(t('تمت إضافة العام الدراسي.', 'Academic year added.'));
      await loadOverview();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const nextRole = currentRole === 'admin' ? 'student' : 'admin';
    try {
      const res = await authFetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (res.ok) await loadOverview();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('لوحة التحكم الإدارية ومحرك تحديث المناهج', 'Admin Control Panel & MOE Curriculum Update Engine')}
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            {t(
              'مراقبة موقع وزارة التربية والتعليم (moe.gov.eg)، استخراج ملفات PDF، مراجعة فروق الإصدارات قبل النشر، وإدارة التقييمات والصلاحيات.',
              'Monitor moe.gov.eg portals, extract & diff official PDFs, manually approve curriculum updates, and manage assessments & audit logs.'
            )}
          </p>
        </div>
        <button
          onClick={loadOverview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('تحديث البيانات', 'Refresh Data')}</span>
        </button>
      </section>

      {statusMessage && (
        <div className="p-3.5 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 text-xs font-medium text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'moe', icon: Globe, ar: 'مراقب موقع الوزارة (moe.gov.eg)', en: 'MOE Portal Monitor' },
          { id: 'versions', icon: FileUp, ar: 'رفع PDF وموافقة الإصدارات', en: 'Curriculum PDF & Diff Queue' },
          { id: 'assessments', icon: Plus, ar: 'رفع تقييمات الوزارة', en: 'Upload Assessments' },
          { id: 'catalog', icon: History, ar: 'المواد والأعوام الدراسية', en: 'Subjects & Years' },
          { id: 'users', icon: Users, ar: 'المستخدمون وسجل التدقيق', en: 'Users & Audit Log' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === item.id
                  ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? item.ar : item.en}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Live MOE Monitor */}
      {tab === 'moe' && (
        <div className="space-y-6">
          <form
            onSubmit={handleMoeScan}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('فحص بوابة وزارة التربية والتعليم المصرية', 'Scan Official Egyptian Ministry Portal')}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {t(
                  'يتحقق الفاحص من robots.txt أولاً ثم يكتشف الروابط وملفات PDF العامة المتاحة رسمياً على نطاق *.moe.gov.eg فقط دون تجاوز أي حماية.',
                  'Checks robots.txt politely first, inspects public *.moe.gov.eg portals, and supplements via Gemini Search Grounding scoped to moe.gov.eg.'
                )}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={scanUrl}
                onChange={(e) => setScanUrl(e.target.value)}
                className="flex-1 text-xs font-mono px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                <option value="https://studentbooks.moe.gov.eg/Performance_Assessments/">
                  https://studentbooks.moe.gov.eg/Performance_Assessments/
                </option>
                <option value="https://studentbooks.moe.gov.eg/">
                  https://studentbooks.moe.gov.eg/
                </option>
                <option value="https://elearning1.moe.gov.eg/">
                  https://elearning1.moe.gov.eg/
                </option>
                <option value="https://moe.gov.eg/">https://moe.gov.eg/</option>
              </select>
              <button
                type="submit"
                disabled={scanning}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] text-white text-xs font-semibold whitespace-nowrap"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                <span>{scanning ? t('جاري فحص الوزارة...', 'Scanning MOE...') : t('تشغيل فحص الآن', 'Run Discovery Check')}</span>
              </button>
            </div>
          </form>

          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('سجل عمليات فحص بوابة الوزارة والموارد المكتشفة', 'MOE Discovery History & Discovered Resources')}
            </h3>
            <div className="space-y-4">
              {(overview?.monitorLogs ?? []).map((log) => (
                <div key={log.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{log.targetUrl}</span>
                    <span className="font-mono text-slate-500">
                      {log.status} · {log.discoveredCount} items · {new Date(log.checkedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{log.notes}</p>
                  {log.discoveredResourcesJson.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      {log.discoveredResourcesJson.slice(0, 8).map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-xs">
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline truncate flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{r.title}</span>
                          </a>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">
                            {r.discoveredVia}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Upload Curriculum PDF + AI Diff + Manual Approval Queue */}
      {tab === 'versions' && (
        <div className="space-y-6">
          <form
            onSubmit={handleUploadCurriculum}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('رفع وثيقة منهج رسمي (PDF) وتحليل التغييرات بالذكاء الاصطناعي', 'Upload Official Curriculum PDF & Generate AI Diff Report')}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {t(
                  'يستخرج النظام النص العربي والإنجليزي من ملف PDF (مع OCR تلقائي للكتب المصورة)، ويقارنه بالمنهج الحالي، ثم يضعه في قائمة الاعتماد دون استبدال تلقائي.',
                  'Extracts Arabic/English PDF text (with Gemini OCR fallback for scanned textbooks), compares against stored lessons, and queues for Admin approval.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('المادة الدراسية', 'Subject')}</label>
                <select
                  value={uploadSubjId}
                  onChange={(e) => setUploadSubjId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  {(overview?.subjects ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.gradeCode.toUpperCase()} — {lang === 'ar' ? s.nameAr : s.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('رقم الإصدار', 'Version Label')}</label>
                <input
                  type="text"
                  value={uploadVersionLabel}
                  onChange={(e) => setUploadVersionLabel(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('عنوان الوثيقة', 'Document Title')}</label>
                <input
                  type="text"
                  value={uploadDocTitle}
                  onChange={(e) => setUploadDocTitle(e.target.value)}
                  placeholder={t('كتاب الطالب 2026', 'Official Student Book 2026')}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t('رابط المصدر الرسمي', 'Official Source URL')}</label>
                <input
                  type="url"
                  value={uploadSourceUrl}
                  onChange={(e) => setUploadSourceUrl(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-xs text-slate-600 dark:text-slate-300"
              />
              <button
                type="submit"
                disabled={uploadingCurriculum || !uploadFile}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] disabled:opacity-50 text-white text-xs font-semibold"
              >
                {uploadingCurriculum ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                <span>
                  {uploadingCurriculum
                    ? t('جاري الاستخراج ومقارنة الفروق...', 'Extracting & Generating Diff...')
                    : t('رفع واستخراج وتوليد تقرير التغييرات', 'Upload, Extract & Generate Diff Report')}
                </span>
              </button>
            </div>
          </form>

          {/* Pending & Historical Curriculum Versions */}
          <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('قائمة مراجعة واعتماد إصدارات المناهج', 'Curriculum Version Approval Queue & History')}
            </h3>
            {(overview?.versions ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">
                {t('لم يتم رفع إصدارات جديدة للمراجعة بعد.', 'No uploaded curriculum versions awaiting review yet.')}
              </p>
            ) : (
              <div className="space-y-4">
                {(overview?.versions ?? []).map((v) => (
                  <div key={v.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {v.documentTitle} ({v.versionLabel})
                        </span>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          Status: {v.status} · {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {v.status === 'pending_review' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVersionAction(v.id, 'approve')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('اعتماد ونشر للطلاب', 'Approve & Publish')}</span>
                          </button>
                          <button
                            onClick={() => handleVersionAction(v.id, 'reject')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{t('رفض', 'Reject')}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {lang === 'ar' ? v.diffSummaryAr : v.diffSummaryEn}
                    </p>

                    {v.changeReportJson && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                            {t('موضوعات جديدة مضافة:', 'Added Topics:')}
                          </div>
                          <ul className="list-disc ps-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                            {v.changeReportJson.addedTopics.length > 0 ? (
                              v.changeReportJson.addedTopics.map((x, idx) => <li key={idx}>{x}</li>)
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                            {t('دروس معدّلة:', 'Modified Lessons:')}
                          </div>
                          <ul className="list-disc ps-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                            {v.changeReportJson.modifiedLessons.length > 0 ? (
                              v.changeReportJson.modifiedLessons.map((x, idx) => <li key={idx}>{x}</li>)
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-semibold text-red-700 dark:text-red-400 mb-1">
                            {t('فصول محذوفة:', 'Removed Chapters:')}
                          </div>
                          <ul className="list-disc ps-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                            {v.changeReportJson.removedChapters.length > 0 ? (
                              v.changeReportJson.removedChapters.map((x, idx) => <li key={idx}>{x}</li>)
                            ) : (
                              <li>—</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: Upload Ministry Assessment */}
      {tab === 'assessments' && (
        <form
          onSubmit={handleUploadAssessment}
          className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-w-3xl"
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t('إضافة / رفع تقييم رسمي لوزارة التربية والتعليم (PDF)', 'Upload Official Ministry Assessment PDF')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              type="text"
              value={assTitleAr}
              onChange={(e) => setAssTitleAr(e.target.value)}
              placeholder={t('عنوان التقييم بالعربية', 'Assessment Title (Arabic)')}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              type="text"
              value={assTitleEn}
              onChange={(e) => setAssTitleEn(e.target.value)}
              placeholder={t('عنوان التقييم بالإنجليزية', 'Assessment Title (English)')}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <select
              value={assGrade}
              onChange={(e) => setAssGrade(e.target.value)}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              {grades.map((g) => (
                <option key={g.code} value={g.code}>
                  {lang === 'ar' ? g.nameAr : g.nameEn}
                </option>
              ))}
            </select>
            <select
              value={assSubjectCode}
              onChange={(e) => setAssSubjectCode(e.target.value)}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              {(overview?.subjects ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.gradeCode.toUpperCase()} — {lang === 'ar' ? s.nameAr : s.nameEn}
                </option>
              ))}
            </select>
            <select
              value={assType}
              onChange={(e) => setAssType(e.target.value)}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              <option value="weekly">{t('تقييم أسبوعي', 'Weekly Assessment')}</option>
              <option value="monthly">{t('تقييم شهري', 'Monthly Assessment')}</option>
              <option value="general">{t('تقييم عام', 'General Assessment')}</option>
              <option value="model_exam">{t('نموذج استرشادي', 'Model Exam')}</option>
              <option value="revision">{t('مراجعة نهائية', 'Revision Material')}</option>
              <option value="question_bank">{t('بنك أسئلة', 'Question Bank')}</option>
            </select>
            <input
              type="url"
              value={assUrl}
              onChange={(e) => setAssUrl(e.target.value)}
              placeholder="https://studentbooks.moe.gov.eg/Performance_Assessments/"
              className="text-xs font-mono px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              type="text"
              value={assPeriodAr}
              onChange={(e) => setAssPeriodAr(e.target.value)}
              placeholder={t('الأسبوع / الشهر بالعربية', 'Period (Arabic)')}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              type="text"
              value={assPeriodEn}
              onChange={(e) => setAssPeriodEn(e.target.value)}
              placeholder={t('الأسبوع / الشهر بالإنجليزية', 'Period (English)')}
              className="text-xs px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setAssFile(e.target.files?.[0] ?? null)}
              className="text-xs text-slate-600 dark:text-slate-300"
            />
            <button
              type="submit"
              disabled={uploadingAss}
              className="px-5 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] text-white text-xs font-semibold"
            >
              {uploadingAss ? t('جاري الرفع...', 'Uploading...') : t('حفظ ونشر التقييم', 'Publish Assessment')}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Manage Subjects & Academic Years */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleCreateSubject}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('إضافة مادة دراسية جديدة', 'Add New Subject')}
            </h2>
            <input
              required
              value={newSubjCode}
              onChange={(e) => setNewSubjCode(e.target.value)}
              placeholder="e.g. sec1-philosophy"
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <select
              value={newSubjGrade}
              onChange={(e) => setNewSubjGrade(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            >
              {grades.map((g) => (
                <option key={g.code} value={g.code}>
                  {lang === 'ar' ? g.nameAr : g.nameEn}
                </option>
              ))}
            </select>
            <input
              required
              value={newSubjAr}
              onChange={(e) => setNewSubjAr(e.target.value)}
              placeholder={t('اسم المادة بالعربية', 'Subject Name (Arabic)')}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              required
              value={newSubjEn}
              onChange={(e) => setNewSubjEn(e.target.value)}
              placeholder={t('اسم المادة بالإنجليزية', 'Subject Name (English)')}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0E5A6D] text-white text-xs font-semibold"
            >
              {t('إضافة المادة', 'Create Subject')}
            </button>
          </form>

          <form
            onSubmit={handleCreateYear}
            className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('إضافة عام دراسي جديد', 'Add Academic Year')}
            </h2>
            <input
              required
              value={newYearCode}
              onChange={(e) => setNewYearCode(e.target.value)}
              placeholder="e.g. 2027-2028"
              className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              required
              value={newYearAr}
              onChange={(e) => setNewYearAr(e.target.value)}
              placeholder={t('العام الدراسي ٢٠٢٧ / ٢٠٢٨', 'Arabic Label')}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <input
              required
              value={newYearEn}
              onChange={(e) => setNewYearEn(e.target.value)}
              placeholder="Academic Year 2027 / 2028"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#0E5A6D] text-white text-xs font-semibold"
            >
              {t('إضافة العام الدراسي', 'Create Academic Year')}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: Users & Audit Logs */}
      {tab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('المستخدمون والصلاحيات', 'Users & Role Permissions')}
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {(overview?.users ?? []).map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {u.displayName || u.email}
                    </div>
                    <div className="text-slate-500 font-mono truncate">{u.email}</div>
                  </div>
                  <button
                    onClick={() => handleToggleRole(u.id, u.role)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    {u.role} → {u.role === 'admin' ? 'student' : 'admin'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-6 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('سجل التدقيق الإداري', 'Administrative Audit Log')}
            </h2>
            {(overview?.auditLogs ?? []).length === 0 ? (
              <p className="text-xs text-slate-500">{t('لا توجد عمليات مسجلة بعد.', 'No admin actions logged yet.')}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {(overview?.auditLogs ?? []).map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-slate-900 dark:text-white">
                        {log.action} ({log.targetType})
                      </div>
                      <div className="text-slate-500 truncate">{log.actorEmail}</div>
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 shrink-0">
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

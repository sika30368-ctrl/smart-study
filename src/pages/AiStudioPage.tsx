import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Calculator,
  FileSpreadsheet,
  ImagePlus,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  InteractivePracticeModal,
  PracticeExamPayload,
} from '../components/InteractivePracticeModal';

interface SubjectOption {
  code: string;
  gradeCode: string;
  nameAr: string;
  nameEn: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: { lessonId: number; titleAr: string; titleEn: string; sourceUrl: string }[];
}

interface SolverResponse {
  solution: {
    subjectIdentified: string;
    topicIdentified: string;
    curriculumAlignment: string;
    rulesAndFormulas: string[];
    steps: {
      stepNumber: number;
      action: string;
      whyNecessary: string;
      workShown: string;
    }[];
    finalAnswer: string;
    similarPracticeQuestion: {
      question: string;
      hint: string;
      solutionSummary: string;
    };
  };
  citations: { lessonId: number; titleAr: string; titleEn: string; sourceUrl: string }[];
}

export const AiStudioPage: React.FC = () => {
  const { lang, t, grades, selectedGrade, authFetch } = useApp();
  const [searchParams] = useSearchParams();

  const initialTab = (() => {
    const p = searchParams.get('tab');
    if (p === 'solver' || p === 'exam' || p === 'tutor') return p;
    return 'tutor';
  })();

  const [activeTab, setActiveTab] = useState<'tutor' | 'solver' | 'exam'>(initialTab);
  const [gradeCode, setGradeCode] = useState<string>(searchParams.get('grade') || selectedGrade);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectCode, setSubjectCode] = useState<string>(searchParams.get('subject') || '');
  const initialLessonId = searchParams.get('lessonId') ? Number(searchParams.get('lessonId')) : undefined;

  // Tutor state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Solver state
  const [problemText, setProblemText] = useState('');
  const [problemImage, setProblemImage] = useState<File | null>(null);
  const [problemImagePreview, setProblemImagePreview] = useState<string | null>(null);
  const [solverLoading, setSolverLoading] = useState(false);
  const [solverResult, setSolverResult] = useState<SolverResponse | null>(null);
  const [solverError, setSolverError] = useState('');
  const [showSimilarAnswer, setShowSimilarAnswer] = useState(false);

  // Exam generator state
  const [examSemester, setExamSemester] = useState<number>(1);
  const [examDifficulty, setExamDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [examCount, setExamCount] = useState<number>(6);
  const [examUnitTopic, setExamUnitTopic] = useState('');
  const [examTypes, setExamTypes] = useState<string[]>([
    'mcq',
    'true_false',
    'complete',
    'written',
  ]);
  const [examGenerating, setExamGenerating] = useState(false);
  const [examError, setExamError] = useState('');
  const [generatedExam, setGeneratedExam] = useState<PracticeExamPayload | null>(null);

  useEffect(() => {
    fetch(`/api/curriculum/subjects?grade=${encodeURIComponent(gradeCode)}`)
      .then((r) => r.json())
      .then((d) => {
        const list: SubjectOption[] = d.subjects ?? [];
        setSubjects(list);
        if (list.length > 0 && !list.some((s) => s.code === subjectCode)) {
          setSubjectCode(list[0].code);
        }
      })
      .catch(() => {});
  }, [gradeCode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatError('');
    const nextHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }];
    setChatHistory(nextHistory);
    setChatLoading(true);

    try {
      const res = await authFetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: msg,
          history: chatHistory.map((m) => ({ role: m.role, content: m.content })),
          gradeCode,
          subjectCode,
          lessonId: initialLessonId,
          language: lang,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI Tutor request failed');
      setConversationId(json.conversationId ?? conversationId);
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: json.reply, citations: json.citations },
      ]);
    } catch (err: any) {
      setChatError(err.message || t('تعذر التواصل مع المساعد الذكي.', 'Could not reach AI Tutor.'));
    } finally {
      setChatLoading(false);
    }
  };

  const handleImagePick = (file: File | null) => {
    setProblemImage(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setProblemImagePreview(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setProblemImagePreview(null);
    }
  };

  const handleSolveProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemText.trim() && !problemImage) return;
    setSolverLoading(true);
    setSolverError('');
    setSolverResult(null);
    setShowSimilarAnswer(false);

    try {
      const formData = new FormData();
      formData.append('questionText', problemText);
      formData.append('gradeCode', gradeCode);
      formData.append('subjectCode', subjectCode);
      formData.append('language', lang);
      if (problemImage) {
        formData.append('image', problemImage);
      }

      const res = await authFetch('/api/ai/solve', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Problem solver failed');
      setSolverResult(json);
    } catch (err: any) {
      setSolverError(err.message || t('تعذر حل المسألة حالياً.', 'Failed to solve problem.'));
    } finally {
      setSolverLoading(false);
    }
  };

  const toggleExamType = (typeId: string) => {
    setExamTypes((prev) =>
      prev.includes(typeId)
        ? prev.length > 1
          ? prev.filter((x) => x !== typeId)
          : prev
        : [...prev, typeId]
    );
  };

  const handleGenerateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamGenerating(true);
    setExamError('');
    try {
      const res = await authFetch('/api/ai/exam-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gradeCode,
          subjectCode,
          semester: examSemester,
          unitTitle: examUnitTopic,
          lessonId: initialLessonId,
          difficulty: examDifficulty,
          questionCount: examCount,
          questionTypes: examTypes,
          language: lang,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Exam generation failed');
      setGeneratedExam(json);
    } catch (err: any) {
      setExamError(err.message || t('تعذر توليد الاختبار التدريبي.', 'Failed to generate practice exam.'));
    } finally {
      setExamGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Context Bar */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'tutor', icon: MessageSquare, ar: 'المعلم الذكي (RAG)', en: 'AI Study Tutor' },
            { id: 'solver', icon: Calculator, ar: 'حل المسائل وصور الواجب', en: 'Problem & Image Solver' },
            { id: 'exam', icon: FileSpreadsheet, ar: 'مولّد الاختبارات التدريبية', en: 'Practice Exam Generator' },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? tab.ar : tab.en}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={gradeCode}
            onChange={(e) => setGradeCode(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            {grades.map((g) => (
              <option key={g.code} value={g.code}>
                {lang === 'ar' ? g.nameAr : g.nameEn}
              </option>
            ))}
          </select>

          <select
            value={subjectCode}
            onChange={(e) => setSubjectCode(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            {subjects.map((s) => (
              <option key={s.code} value={s.code}>
                {lang === 'ar' ? s.nameAr : s.nameEn}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* TAB A: AI Study Tutor (RAG Multi-turn Chat) */}
      {activeTab === 'tutor' && (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col h-[68vh] min-h-[480px] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {t(
                'يميز المعلم الذكي بين نص المنهج المصري الرسمي والشرح التعليمي الإضافي مع طرح أسئلة للفهم العميق.',
                'Grounded in official Egyptian curriculum RAG context with source citations and Socratic follow-up questions.'
              )}
            </div>
            {chatHistory.length > 0 && (
              <button
                onClick={() => {
                  setChatHistory([]);
                  setConversationId(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 whitespace-nowrap"
              >
                {t('محادثة جديدة', 'New Chat')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {chatHistory.length === 0 ? (
              <div className="max-w-xl mx-auto text-center py-10 space-y-4">
                <Sparkles className="w-8 h-8 text-[#0E5A6D] dark:text-[#4DD0E1] mx-auto" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('اسأل المعلم الذكي في المنهج المصري', 'Ask the Egyptian Curriculum AI Tutor')}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  {t(
                    'اطلب شرح أي مفهوم صعب، أو مقارنة بين القوانين، أو أمثلة محلولة مناسبة لصفك الدراسي.',
                    'Ask for step-by-step concept explanations, comparisons, or worked examples tailored to your exact grade.'
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {[
                    t('اشرح لي قانون أوم للدائرة المغلقة بمثال سهل', 'Explain Ohm’s Law for closed circuits with an example'),
                    t('لماذا تبلغ كثافة الماء أقصاها عند 4 درجات مئوية؟', 'Why does pure water reach maximum density at 4°C?'),
                    t('ما الفرق بين المادة البارامغناطيسية والدايامغناطيسية؟', 'Compare paramagnetic and diamagnetic ions'),
                  ].map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setChatInput(prompt)}
                      className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-[#0E5A6D] text-white dark:bg-[#1A7D94]'
                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="space-y-3">
                        <div className="study-prose">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                            <div className="font-semibold">{t('مصادر المنهج المسترجعة:', 'Retrieved Curriculum Sources:')}</div>
                            {msg.citations.map((c, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <BookOpen className="w-3 h-3 shrink-0" />
                                <span>{lang === 'ar' ? c.titleAr : c.titleEn}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}

            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-[#0E5A6D]" />
                <span>{t('جاري البحث في المنهج وتجهيز الشرح...', 'Retrieving curriculum context and composing explanation...')}</span>
              </div>
            )}
            {chatError && (
              <div className="text-xs text-red-600 dark:text-red-400">{chatError}</div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 bg-white dark:bg-[#111827]"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t('اكتب سؤالك في المنهج هنا...', 'Ask any question about your Egyptian curriculum...')}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>{t('إرسال', 'Send')}</span>
            </button>
          </form>
        </section>
      )}

      {/* TAB B: Homework & Image Problem Solver */}
      {activeTab === 'solver' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleSolveProblem}
            className="lg:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 h-fit"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t('حل المسائل والتمارين خطوة بخطوة', 'Step-by-Step Homework & Problem Solver')}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {t(
                  'اكتب مسألة رياضيات أو فيزياء أو كيمياء أو نحو، أو ارفع صورة واضحة للتمرين من كتابك أو كراستك.',
                  'Type a math, physics, chemistry, or grammar exercise, or upload a photo of a homework page.'
                )}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('نص المسألة أو السؤال', 'Problem Statement')}
              </label>
              <textarea
                rows={4}
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                placeholder={t(
                  'مثال: بطارية قوتها الدافعة 12 فولت ومقاومتها الداخلية 1 أوم، اتصلت بمقاومتين 6 أوم و3 أوم على التوازي...',
                  'Example: A 12 V battery with internal resistance 1 ohm is connected to 6 ohm and 3 ohm resistors in parallel...'
                )}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                {t('أو ارفع صورة للتمرين (اختياري)', 'Or Upload Exercise Photo (Optional)')}
              </label>
              <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#0E5A6D] cursor-pointer text-xs text-slate-500 dark:text-slate-400">
                <ImagePlus className="w-5 h-5" />
                <span>{problemImage ? problemImage.name : t('اضغط لاختيار صورة (PNG, JPG)', 'Click to choose an image (PNG, JPG)')}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
                />
              </label>
              {problemImagePreview && (
                <div className="mt-3 relative">
                  <img
                    src={problemImagePreview}
                    alt="Uploaded homework preview"
                    className="w-full max-h-48 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleImagePick(null)}
                    className="absolute top-2 end-2 p-1.5 rounded-md bg-slate-900/80 text-white"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {solverError && <p className="text-xs text-red-600 dark:text-red-400">{solverError}</p>}

            <button
              type="submit"
              disabled={solverLoading || (!problemText.trim() && !problemImage)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] disabled:opacity-50 text-white text-xs font-semibold"
            >
              {solverLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{solverLoading ? t('جاري تحليل المسألة...', 'Solving step by step...') : t('اشرح الحل خطوة بخطوة', 'Solve Step by Step')}</span>
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            {!solverResult && !solverLoading ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                <Calculator className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('سيظهر الحل المفصل والقوانين وسؤال تدريبي مماثل هنا', 'Your step-by-step solution, formulas, and similar practice problem will appear here')}
                </p>
              </div>
            ) : solverLoading ? (
              <div className="min-h-[320px] flex items-center justify-center gap-3 text-sm text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-[#0E5A6D]" />
                <span>{t('جاري قراءة المسألة ومطابقتها مع قوانين المنهج...', 'Reading exercise and verifying curriculum rules...')}</span>
              </div>
            ) : (
              solverResult && (
                <div className="space-y-6">
                  <div className="pb-4 border-b border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {solverResult.solution.subjectIdentified} · {solverResult.solution.curriculumAlignment}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {solverResult.solution.topicIdentified}
                    </h3>
                  </div>

                  {solverResult.solution.rulesAndFormulas.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        {t('القوانين والقواعد المستخدمة', 'Relevant Rules & Formulas')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {solverResult.solution.rulesAndFormulas.map((rule, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                          >
                            {rule}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      {t('خطوات الحل ولماذا كل خطوة ضرورية', 'Step-by-Step Solution & Reasoning')}
                    </h4>
                    <div className="space-y-3">
                      {solverResult.solution.steps.map((st) => (
                        <div
                          key={st.stepNumber}
                          className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5"
                        >
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {st.stepNumber}. {st.action}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            <span className="font-semibold">{t('لماذا هذه الخطوة؟', 'Why this step:')}</span>{' '}
                            {st.whyNecessary}
                          </div>
                          <div className="text-sm font-mono bg-slate-50 dark:bg-slate-900 p-2.5 rounded-md text-slate-800 dark:text-slate-200">
                            {st.workShown}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      {t('الإجابة النهائية', 'Final Answer')}
                    </div>
                    <div className="text-base font-bold text-emerald-950 dark:text-emerald-100 mt-1">
                      {solverResult.solution.finalAnswer}
                    </div>
                  </div>

                  {/* Similar Practice Question */}
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-[#0E5A6D] dark:text-[#4DD0E1]">
                      {t('سؤال تدريبي مماثل لتثبيت الفهم', 'Similar Practice Question')}
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {solverResult.solution.similarPracticeQuestion.question}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t('تلميح:', 'Hint:')} {solverResult.solution.similarPracticeQuestion.hint}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSimilarAnswer((s) => !s)}
                      className="text-xs font-semibold text-[#0E5A6D] dark:text-[#4DD0E1] hover:underline"
                    >
                      {showSimilarAnswer ? t('إخفاء الحل', 'Hide Solution') : t('عرض ملخص الحل', 'Show Solution Summary')}
                    </button>
                    {showSimilarAnswer && (
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300">
                        {solverResult.solution.similarPracticeQuestion.solutionSummary}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* TAB C: AI Practice Exam Generator */}
      {activeTab === 'exam' && (
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-3xl space-y-5">
          <div>
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
              {t(
                'تنبيه: الاختبارات المولدة هنا اختبارات تدريبية بالذكاء الاصطناعي وليست امتحانات وزارية رسمية.',
                'Notice: Generated quizzes are AI practice exams clearly separated from official Ministry assessments.'
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('مولّد الاختبارات التدريبية الذكي', 'AI Practice Exam Generator')}
            </h2>
          </div>

          <form onSubmit={handleGenerateExam} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t('الفصل الدراسي', 'Semester')}
                </label>
                <select
                  value={examSemester}
                  onChange={(e) => setExamSemester(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  <option value={1}>{t('الفصل الدراسي الأول', 'First Semester')}</option>
                  <option value={2}>{t('الفصل الدراسي الثاني', 'Second Semester')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t('مستوى الصعوبة', 'Difficulty Level')}
                </label>
                <select
                  value={examDifficulty}
                  onChange={(e) => setExamDifficulty(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                >
                  <option value="easy">{t('سهل (تأسيسي)', 'Easy (Foundational)')}</option>
                  <option value="medium">{t('متوسط (مواصفات الامتحان)', 'Medium (Exam Standard)')}</option>
                  <option value="hard">{t('متقدم (مستويات عليا)', 'Hard (Higher-Order Thinking)')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t('عدد الأسئلة', 'Number of Questions')}
                </label>
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={examCount}
                  onChange={(e) => setExamCount(Number(e.target.value))}
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t('تركيز الوحدة أو الدرس (اختياري)', 'Unit or Lesson Focus (Optional)')}
              </label>
              <input
                type="text"
                value={examUnitTopic}
                onChange={(e) => setExamUnitTopic(e.target.value)}
                placeholder={t('مثال: قانونا كيرشوف، أو العناصر الانتقالية...', 'e.g., Kirchhoff’s Laws, or Transition Elements...')}
                className="w-full text-xs px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                {t('أنماط الأسئلة المطلوبة', 'Question Formats Included')}
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'mcq', ar: 'اختيار من متعدد', en: 'Multiple Choice' },
                  { id: 'true_false', ar: 'صواب أم خطأ', en: 'True / False' },
                  { id: 'complete', ar: 'أكمل العبارة', en: 'Fill in the Blanks' },
                  { id: 'written', ar: 'أسئلة مقالية', en: 'Written Response' },
                  { id: 'math_problem', ar: 'مسائل حسابية وعلمية', en: 'Math / Science Problems' },
                ].map((qt) => (
                  <button
                    key={qt.id}
                    type="button"
                    onClick={() => toggleExamType(qt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      examTypes.includes(qt.id)
                        ? 'border-[#0E5A6D] bg-[#0E5A6D]/10 text-[#0E5A6D] dark:border-[#22A6B3] dark:text-[#4DD0E1]'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {lang === 'ar' ? qt.ar : qt.en}
                  </button>
                ))}
              </div>
            </div>

            {examError && <p className="text-xs text-red-600 dark:text-red-400">{examError}</p>}

            <button
              type="submit"
              disabled={examGenerating}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] disabled:opacity-50 text-white text-xs font-semibold"
            >
              {examGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>
                {examGenerating
                  ? t('جاري إعداد الاختبار ومفتاح الإجابة المنفصل...', 'Generating exam & separate answer key...')
                  : t('توليد وبدء الاختبار التدريبي التفاعلي', 'Generate & Launch Interactive Practice Exam')}
              </span>
            </button>
          </form>
        </section>
      )}

      {generatedExam && (
        <InteractivePracticeModal exam={generatedExam} onClose={() => setGeneratedExam(null)} />
      )}
    </div>
  );
};

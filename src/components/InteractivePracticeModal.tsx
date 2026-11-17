import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface PracticeQuestion {
  id: string;
  type: 'mcq' | 'true_false' | 'complete' | 'written' | 'math_problem' | string;
  prompt: string;
  options?: string[];
  points: number;
}

export interface PracticeAnswerKey {
  id: string;
  correctAnswer: string;
  explanation: string;
  curriculumReference?: string;
}

export interface PracticeExamPayload {
  examId?: number | null;
  examTitle: string;
  isPracticeSimulation?: boolean;
  basedOnOfficialAssessment?: {
    id: number;
    titleAr: string;
    titleEn: string;
    officialSourceUrl: string;
  };
  questions: PracticeQuestion[];
  answerKey: PracticeAnswerKey[];
}

interface Props {
  exam: PracticeExamPayload;
  onClose: () => void;
}

export const InteractivePracticeModal: React.FC<Props> = ({ exam, onClose }) => {
  const { t, authFetch, firebaseUser } = useApp();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [savingScore, setSavingScore] = useState(false);

  const keyById = new Map(exam.answerKey.map((k) => [k.id, k]));

  const evaluateObjectiveCorrectness = (q: PracticeQuestion, userAns: string | undefined) => {
    const key = keyById.get(q.id);
    if (!key || !userAns) return false;
    const normUser = userAns.trim().toLowerCase();
    const normKey = key.correctAnswer.trim().toLowerCase();
    if (q.type === 'mcq' || q.type === 'true_false') {
      return normUser === normKey;
    }
    if (q.type === 'complete') {
      return normUser === normKey || normKey.includes(normUser) || normUser.includes(normKey);
    }
    return false;
  };

  const objectiveQuestions = exam.questions.filter((q) =>
    ['mcq', 'true_false', 'complete'].includes(q.type)
  );
  const totalObjectivePoints = objectiveQuestions.reduce((acc, q) => acc + (q.points || 1), 0);
  const earnedObjectivePoints = objectiveQuestions.reduce(
    (acc, q) => acc + (evaluateObjectiveCorrectness(q, answers[q.id]) ? q.points || 1 : 0),
    0
  );
  const scorePercent =
    totalObjectivePoints > 0 ? Math.round((earnedObjectivePoints / totalObjectivePoints) * 100) : null;

  const handleSubmit = async () => {
    setSubmitted(true);
    setShowAnswerKey(true);
    const allOpen: Record<string, boolean> = {};
    exam.questions.forEach((q) => (allOpen[q.id] = true));
    setExpandedExplanations(allOpen);

    if (exam.examId && firebaseUser) {
      setSavingScore(true);
      try {
        await authFetch(`/api/ai/exam/${exam.examId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers,
            score: scorePercent,
          }),
        });
      } catch (err) {
        console.error('Could not persist practice exam score:', err);
      } finally {
        setSavingScore(false);
      }
    }
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
    setShowAnswerKey(false);
    setExpandedExplanations({});
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'mcq':
        return t('اختيار من متعدد', 'Multiple Choice');
      case 'true_false':
        return t('صواب أم خطأ', 'True / False');
      case 'complete':
        return t('أكمل العبارة', 'Fill in the Blank');
      case 'math_problem':
        return t('مسألة رياضية / علمية', 'Math / Science Problem');
      default:
        return t('سؤال مقالي', 'Written Response');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t(
                  'نموذج تدريبي تفاعلي (بالذكاء الاصطناعي) — ليس اختباراً وزارياً رسمياً',
                  'Interactive Practice Simulation — Not an Official Ministry Exam'
                )}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {exam.examTitle}
            </h2>
            {exam.basedOnOfficialAssessment && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('مبني على موضوع التقييم الرسمي:', 'Practice mode aligned with official assessment:')}{' '}
                <a
                  href={exam.basedOnOfficialAssessment.officialSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-[#0E5A6D] dark:text-[#4DD0E1]"
                >
                  {t(
                    exam.basedOnOfficialAssessment.titleAr,
                    exam.basedOnOfficialAssessment.titleEn
                  )}
                </a>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Score Summary Bar after submission */}
        {submitted && (
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              {scorePercent !== null ? (
                <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {t('الدرجة الموضوعية:', 'Auto-Graded Score:')}{' '}
                  <span className="font-mono text-[#0E5A6D] dark:text-[#4DD0E1]">
                    {earnedObjectivePoints} / {totalObjectivePoints} ({scorePercent}%)
                  </span>
                </div>
              ) : (
                <div className="font-semibold text-slate-900 dark:text-white">
                  {t('قارن إجاباتك المقالية بنموذج الإجابة أدناه', 'Compare your written answers with the answer key below')}
                </div>
              )}
              {savingScore && (
                <span className="text-xs text-slate-500">{t('جاري الحفظ...', 'Saving...')}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAnswerKey((s) => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
              >
                {showAnswerKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>
                  {showAnswerKey
                    ? t('إخفاء نموذج الإجابة', 'Hide Answer Key')
                    : t('إظهار نموذج الإجابة', 'Show Answer Key')}
                </span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('إعادة المحاولة', 'Retake Practice')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Questions Scroll Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {exam.questions.map((q, idx) => {
            const key = keyById.get(q.id);
            const userVal = answers[q.id] ?? '';
            const isObj = ['mcq', 'true_false', 'complete'].includes(q.type);
            const isCorrect = submitted && isObj && evaluateObjectiveCorrectness(q, userVal);

            return (
              <div
                key={q.id}
                className="pb-6 border-b border-slate-200 dark:border-slate-800 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                  <span>
                    {t(`سؤال ${idx + 1}`, `Question ${idx + 1}`)} · {typeLabel(q.type)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {q.points || 1} {t('درجة', 'pts')}
                  </span>
                </div>

                <p className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed mb-3">
                  {q.prompt}
                </p>

                {/* MCQ or True/False */}
                {(q.type === 'mcq' || q.type === 'true_false') && q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.options.map((opt, optIdx) => {
                      const selected = userVal === opt;
                      const isKeyAnswer = submitted && showAnswerKey && key?.correctAnswer === opt;
                      let stateStyle =
                        'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500';
                      if (selected && !submitted) {
                        stateStyle =
                          'border-[#0E5A6D] bg-[#0E5A6D]/8 dark:border-[#22A6B3] dark:bg-[#22A6B3]/15';
                      } else if (submitted && isKeyAnswer) {
                        stateStyle =
                          'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-500';
                      } else if (submitted && selected && !isKeyAnswer) {
                        stateStyle =
                          'border-red-500 bg-red-50 dark:bg-red-950/40 dark:border-red-500';
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={submitted}
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                          className={`text-start px-3.5 py-2.5 rounded-lg border text-sm transition-colors flex items-center justify-between gap-2 ${stateStyle}`}
                        >
                          <span>{opt}</span>
                          {submitted && isKeyAnswer && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          )}
                          {submitted && selected && !isKeyAnswer && (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Fill-in-the-blank */}
                {q.type === 'complete' && (
                  <div>
                    <input
                      type="text"
                      disabled={submitted}
                      value={userVal}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={t('اكتب الإجابة الناقصة هنا...', 'Type the missing term or phrase...')}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
                    />
                    {submitted && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                        {isCorrect ? (
                          <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t('إجابة صحيحة', 'Correct')}
                          </span>
                        ) : (
                          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            {t('تحقق من الإجابة النموذجية أدناه', 'Review model answer below')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Written / Math Problem */}
                {!['mcq', 'true_false', 'complete'].includes(q.type) && (
                  <textarea
                    rows={3}
                    disabled={submitted}
                    value={userVal}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder={t('اكتب خطوات الحل أو الإجابة المقالية هنا...', 'Write your steps or detailed response here...')}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
                  />
                )}

                {/* Separate Answer Key & Step-by-Step Explanation Panel */}
                {showAnswerKey && key && (
                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 p-3.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedExplanations((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="w-full flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      <span>
                        {t('الإجابة النموذجية والشرح التفصيلي:', 'Model Answer & Step-by-Step Explanation:')}{' '}
                        <span className="text-[#0E5A6D] dark:text-[#4DD0E1]">{key.correctAnswer}</span>
                      </span>
                      {expandedExplanations[q.id] ? (
                        <ChevronUp className="w-4 h-4 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0" />
                      )}
                    </button>
                    {expandedExplanations[q.id] && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
                        <p>{key.explanation}</p>
                        {key.curriculumReference && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1">
                            <BookOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {t('المرجع في المنهج:', 'Curriculum Reference:')} {key.curriculumReference}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Controls */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('تمت الإجابة على', 'Answered')}{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-white">
              {Object.values(answers).filter((v) => v.trim().length > 0).length} / {exam.questions.length}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {!submitted && (
              <button
                type="button"
                onClick={() => {
                  setShowAnswerKey((s) => !s);
                  const allOpen: Record<string, boolean> = {};
                  exam.questions.forEach((q) => (allOpen[q.id] = true));
                  setExpandedExplanations(allOpen);
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                {showAnswerKey
                  ? t('إخفاء مفاتيح الإجابة', 'Hide Answer Key')
                  : t('عرض نموذج الإجابة منفصلاً', 'Reveal Separate Answer Key')}
              </button>
            )}
            {!submitted ? (
              <button
                type="button"
                onClick={handleSubmit}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#0E5A6D] hover:bg-[#0B4A5A] dark:bg-[#1A7D94] text-white transition-colors whitespace-nowrap"
              >
                {t('تسليم ومراجعة الحلول', 'Submit & Grade Practice')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 whitespace-nowrap"
              >
                {t('إنهاء المراجعة', 'Done')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

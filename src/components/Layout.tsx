import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
  Languages,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    lang,
    setLang,
    t,
    theme,
    toggleTheme,
    profile,
    firebaseUser,
    signInWithGoogle,
    logout,
    grades,
    academicYears,
    selectedGrade,
    setSelectedGrade,
    selectedYear,
    setSelectedYear,
    localSyncTime,
    syncingLocal,
    syncCurriculumLocally,
  } = useApp();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in failed:', err);
    } finally {
      setSigningIn(false);
    }
  };

  const navItems = [
    {
      to: '/',
      label: t('لوحة الطالب', 'Dashboard'),
      icon: LayoutDashboard,
      end: true,
    },
    {
      to: '/curriculum',
      label: t('المناهج المصرية', 'Egyptian Curricula'),
      icon: BookOpen,
      end: false,
    },
    {
      to: '/assessments',
      label: t('تقييمات الوزارة', 'Ministry Assessments'),
      icon: ClipboardCheck,
      end: false,
    },
    {
      to: '/ai-studio',
      label: t('المساعد الذكي', 'AI Study Studio'),
      icon: Sparkles,
      end: false,
    },
    {
      to: '/search',
      label: t('البحث في المناهج', 'Curriculum Search'),
      icon: Search,
      end: false,
    },
    {
      to: '/admin',
      label: t('لوحة الإدارة', 'Admin Panel'),
      icon: ShieldCheck,
      end: false,
    },
  ];

  const currentGradeObj = grades.find((g) => g.code === selectedGrade);

  const pageTitle = (() => {
    if (location.pathname.startsWith('/curriculum') || location.pathname.startsWith('/lesson')) {
      return t('المناهج الدراسية المصرية', 'Egyptian National Curricula');
    }
    if (location.pathname.startsWith('/assessments')) {
      return t('تقييمات وزارة التربية والتعليم', 'Official Ministry Assessments');
    }
    if (location.pathname.startsWith('/ai-studio')) {
      return t('المساعد التعليمي الذكي', 'AI Educational Assistant');
    }
    if (location.pathname.startsWith('/search')) {
      return t('محرك البحث في المناهج', 'Curriculum Search Engine');
    }
    if (location.pathname.startsWith('/admin')) {
      return t('لوحة التحكم والإدارة', 'Administration & MOE Sync');
    }
    return t('لوحة الطالب التعليمية', 'Student Dashboard');
  })();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100 transition-colors">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="w-8 h-8 rounded-lg bg-[#0E5A6D] dark:bg-[#1A7D94] text-white flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
              Smart Study
            </span>
          </Link>
        </div>

        {/* Grade & Year Selector */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t('الصف الدراسي', 'Grade Level')}
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full text-xs font-medium px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
            >
              <optgroup label={t('المرحلة الإعدادية', 'Preparatory Stage')}>
                {grades
                  .filter((g) => g.stage === 'preparatory')
                  .map((g) => (
                    <option key={g.code} value={g.code}>
                      {lang === 'ar' ? g.nameAr : g.nameEn}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t('المرحلة الثانوية', 'Secondary Stage')}>
                {grades
                  .filter((g) => g.stage === 'secondary')
                  .map((g) => (
                    <option key={g.code} value={g.code}>
                      {lang === 'ar' ? g.nameAr : g.nameEn}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t('العام الدراسي', 'Academic Year')}
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0E5A6D]"
            >
              {academicYears.map((y) => (
                <option key={y.code} value={y.code}>
                  {lang === 'ar' ? y.labelAr : y.labelEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#0E5A6D]/10 text-[#0E5A6D] dark:bg-[#22A6B3]/15 dark:text-[#4DD0E1]'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Utility Controls */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <button
            onClick={syncCurriculumLocally}
            disabled={syncingLocal}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-2 truncate">
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncingLocal ? 'animate-spin' : ''}`} />
              <span>{t('مزامنة المناهج محلياً', 'Local Curriculum Sync')}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              {localSyncTime ? t('محفوظ', 'Synced') : '—'}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
            </button>
            <button
              onClick={toggleTheme}
              aria-label={t('تبديل المظهر', 'Toggle theme')}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-[#111827] h-full flex flex-col border-e border-slate-200 dark:border-slate-800 shadow-xl z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-bold text-base text-slate-900 dark:text-white">Smart Study</span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full text-xs font-medium px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                {grades.map((g) => (
                  <option key={g.code} value={g.code}>
                    {lang === 'ar' ? g.nameAr : g.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive
                          ? 'bg-[#0E5A6D]/10 text-[#0E5A6D] dark:bg-[#22A6B3]/15 dark:text-[#4DD0E1]'
                          : 'text-slate-700 dark:text-slate-300'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <button
                onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
                className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
              <button
                onClick={toggleTheme}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Top Header */}
        <header className="h-16 sticky top-0 z-30 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={t('القائمة', 'Menu')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {pageTitle}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {currentGradeObj ? (lang === 'ar' ? currentGradeObj.nameAr : currentGradeObj.nameEn) : ''}
                {' · '}
                <span className="font-mono tabular-nums">{selectedYear}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate('/search')}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t('ابحث في الدروس والقوانين...', 'Search lessons & formulas...')}</span>
            </button>

            {firebaseUser ? (
              <div className="flex items-center gap-2.5">
                <div className="hidden sm:block text-end">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white leading-tight max-w-[140px] truncate">
                    {profile?.displayName || firebaseUser.displayName || firebaseUser.email}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {profile?.role === 'admin' ? t('مسؤول المنصة', 'Administrator') : t('طالب', 'Student')}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t('خروج', 'Sign Out')}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0E5A6D] hover:bg-[#0B4A5A] dark:bg-[#1A7D94] dark:hover:bg-[#156B80] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{signingIn ? t('جاري الدخول...', 'Signing in...') : t('تسجيل الدخول بـ Google', 'Sign in with Google')}</span>
              </button>
            )}
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

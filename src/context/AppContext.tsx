import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

export type Language = 'ar' | 'en';
export type ThemeMode = 'light' | 'dark';

export interface GradeInfo {
  id: number;
  code: string;
  stage: string;
  nameAr: string;
  nameEn: string;
  shortAr: string;
  shortEn: string;
  orderIndex: number;
}

export interface AcademicYearInfo {
  id: number;
  code: string;
  labelAr: string;
  labelEn: string;
  isActive: boolean;
}

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
  role: 'student' | 'admin';
  gradeCode: string;
  track: string;
  academicYear: string;
  preferredLang: string;
}

interface AppContextValue {
  lang: Language;
  setLang: (l: Language) => void;
  t: (ar: string, en: string) => string;
  theme: ThemeMode;
  toggleTheme: () => void;
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  grades: GradeInfo[];
  academicYears: AcademicYearInfo[];
  selectedGrade: string;
  setSelectedGrade: (code: string) => void;
  selectedTrack: string;
  setSelectedTrack: (track: string) => void;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  localSyncTime: string | null;
  syncingLocal: boolean;
  syncCurriculumLocally: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const LOCAL_CURRICULUM_KEY = 'smart_study_egypt_curriculum_snapshot_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('smart_study_lang');
    return saved === 'en' ? 'en' : 'ar';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('smart_study_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [grades, setGrades] = useState<GradeInfo[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearInfo[]>([]);
  const [selectedGrade, setSelectedGradeState] = useState<string>(
    () => localStorage.getItem('smart_study_grade') || 'sec3'
  );
  const [selectedTrack, setSelectedTrackState] = useState<string>(
    () => localStorage.getItem('smart_study_track') || 'all'
  );
  const [selectedYear, setSelectedYearState] = useState<string>(
    () => localStorage.getItem('smart_study_year') || '2025-2026'
  );

  const [localSyncTime, setLocalSyncTime] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_CURRICULUM_KEY);
      if (raw) return JSON.parse(raw).syncedAt ?? null;
    } catch {
      return null;
    }
    return null;
  });
  const [syncingLocal, setSyncingLocal] = useState(false);

  // Sync HTML dir and lang attributes
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('smart_study_lang', lang);
  }, [lang]);

  // Sync Tailwind dark class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('smart_study_theme', theme);
  }, [theme]);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers || {});
      const currentUser = auth.currentUser;
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          headers.set('Authorization', `Bearer ${idToken}`);
        } catch (err) {
          console.warn('Could not retrieve Firebase ID token:', err);
        }
      }
      return fetch(url, { ...init, headers });
    },
    []
  );

  const refreshBootstrap = useCallback(async () => {
    try {
      const res = await authFetch('/api/bootstrap');
      if (!res.ok) return;
      const data = await res.json();
      setGrades(data.grades || []);
      setAcademicYears(data.academicYears || []);
      if (data.user) {
        setProfile(data.user);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Failed to load bootstrap metadata:', err);
    }
  }, [authFetch]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      await refreshBootstrap();
      setAuthLoading(false);
    });
    return () => unsub();
  }, [refreshBootstrap]);

  const setLang = (l: Language) => {
    setLangState(l);
    if (auth.currentUser) {
      authFetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredLang: l }),
      }).catch(() => {});
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  const setSelectedGrade = (code: string) => {
    setSelectedGradeState(code);
    localStorage.setItem('smart_study_grade', code);
    if (auth.currentUser) {
      authFetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeCode: code }),
      }).catch(() => {});
    }
  };

  const setSelectedTrack = (track: string) => {
    setSelectedTrackState(track);
    localStorage.setItem('smart_study_track', track);
    if (auth.currentUser) {
      authFetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track }),
      }).catch(() => {});
    }
  };

  const setSelectedYear = (year: string) => {
    setSelectedYearState(year);
    localStorage.setItem('smart_study_year', year);
    if (auth.currentUser) {
      authFetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: year }),
      }).catch(() => {});
    }
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
    await refreshBootstrap();
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
  };

  const syncCurriculumLocally = useCallback(async () => {
    setSyncingLocal(true);
    try {
      const res = await fetch('/api/curriculum/snapshot');
      if (res.ok) {
        const snapshot = await res.json();
        localStorage.setItem(LOCAL_CURRICULUM_KEY, JSON.stringify(snapshot));
        setLocalSyncTime(snapshot.syncedAt);
      }
    } catch (err) {
      console.error('Local curriculum sync failed:', err);
    } finally {
      setSyncingLocal(false);
    }
  }, []);

  // Automatically cache local Egyptian curriculum snapshot once on load if absent
  useEffect(() => {
    if (!localSyncTime) {
      syncCurriculumLocally();
    }
  }, [localSyncTime, syncCurriculumLocally]);

  const t = useCallback((ar: string, en: string) => (lang === 'ar' ? ar : en), [lang]);

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        t,
        theme,
        toggleTheme,
        firebaseUser,
        profile,
        authLoading,
        signInWithGoogle,
        logout,
        authFetch,
        grades,
        academicYears,
        selectedGrade,
        setSelectedGrade,
        selectedTrack,
        setSelectedTrack,
        selectedYear,
        setSelectedYear,
        localSyncTime,
        syncingLocal,
        syncCurriculumLocally,
        refreshBootstrap,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { dict, type MessageKey } from './messages';

export type Lang = 'bn' | 'en';
export type { MessageKey };

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: MessageKey) => string };
const LangContext = createContext<Ctx | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'bn' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return 'bn';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const value = useMemo<Ctx>(() => ({
    lang,
    setLang: (l) => {
      setLangState(l);
      try { localStorage.setItem('lang', l); } catch { /* ignore */ }
      document.documentElement.lang = l;
    },
    t: (k) => dict[lang][k],
  }), [lang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}

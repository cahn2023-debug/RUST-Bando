import { useState } from 'react';
import { changeLanguage, getCurrentLanguage } from '@/modules/i18n';
import { Globe } from 'lucide-react';

export const LanguageSwitcher = () => {
  const [currentLang, setCurrentLang] = useState<'vi' | 'en'>(getCurrentLanguage());

  const toggleLanguage = async () => {
    const newLang = currentLang === 'vi' ? 'en' : 'vi';
    await changeLanguage(newLang);
    setCurrentLang(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-cad-text-muted hover:text-cad-text-primary transition-colors rounded hover:bg-white/5"
      aria-label={currentLang === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
      title={currentLang === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
    >
      <Globe size={14} aria-hidden="true" />
      <span className="uppercase font-medium">{currentLang}</span>
    </button>
  );
};

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { changeLanguage, getCurrentLanguage } from '@/modules/i18n';

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState<'vi' | 'en'>(getCurrentLanguage());

  useEffect(() => {
    setCurrentLang((i18n.language as 'vi' | 'en') || 'vi');
  }, [i18n.language]);

  const toggleLanguage = async () => {
    const newLang = currentLang === 'vi' ? 'en' : 'vi';
    await changeLanguage(newLang);
    setCurrentLang(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center justify-center px-2 py-1 text-[11px] font-extrabold text-cad-text-secondary hover:text-cad-text-primary transition-all rounded hover:bg-white/10 cursor-pointer uppercase tracking-wider select-none min-w-[28px]"
      aria-label={currentLang === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
      title={currentLang === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
    >
      <span>{currentLang}</span>
    </button>
  );
};


import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import viCommon from './locales/vi/common.json';
import enCommon from './locales/en/common.json';

// Define available resources
const resources = {
  vi: {
    common: viCommon,
  },
  en: {
    common: enCommon,
  },
};

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'vi',
    defaultNS: 'common',
    supportedLngs: ['vi', 'en'],
    debug: import.meta.env.VITE_DEBUG_LOGS === 'true',
    
    interpolation: {
      escapeValue: false, // React already escapes
    },
    
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    
    react: {
      useSuspense: true,
    },
  });

export default i18n;

// Helper function to change language
export const changeLanguage = async (lng: 'vi' | 'en') => {
  await i18n.changeLanguage(lng);
  localStorage.setItem('i18nextLng', lng);
};

// Helper to get current language
export const getCurrentLanguage = (): 'vi' | 'en' => {
  return (i18n.language as 'vi' | 'en') || 'vi';
};

// Type-safe translation hook
export type TranslationKeys = keyof typeof viCommon;

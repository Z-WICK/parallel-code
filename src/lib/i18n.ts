export type AppLocale = 'en' | 'zh-CN';

const APP_LOCALES: AppLocale[] = ['en', 'zh-CN'];
const APP_LOCALE_SET = new Set<AppLocale>(APP_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && APP_LOCALE_SET.has(value as AppLocale);
}

export function getPreferredLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'en';
  const languages = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  return languages.some((lang) => /^zh(?:-|$)/i.test(lang)) ? 'zh-CN' : 'en';
}

export function localize(locale: AppLocale, english: string, chinese: string): string {
  return locale === 'zh-CN' ? chinese : english;
}


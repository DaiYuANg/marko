import { defaultLocale, normalizeLocale, type Locale } from '@/i18n/resources'

export function getSystemLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLocale(navigator.language)
  }
  return defaultLocale
}

export function getInitialLocale(): Locale {
  return getSystemLocale()
}

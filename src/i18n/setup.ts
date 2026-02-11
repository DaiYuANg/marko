import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { defaultLocale, resources } from '@/i18n/resources'
import { getInitialLocale } from '@/i18n/utils'

void i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLocale(),
  fallbackLng: defaultLocale,
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

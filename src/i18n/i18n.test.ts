import { describe, expect, it } from 'vitest'
import {
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  fieldLabel,
  resolveLocale,
  t,
} from './index'
import { fr } from './locales/fr'
import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { it as itCatalog } from './locales/it'
import { pt } from './locales/pt'

const catalogs = { fr, en, es, de, it: itCatalog, pt }

describe('i18n', () => {
  it('toutes les langues ont les mêmes clés que le français', () => {
    const keys = Object.keys(fr).sort()
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(catalogs[locale]).sort(), locale).toEqual(keys)
    }
  })

  it('détecte la langue du navigateur', () => {
    expect(resolveLocale('fr')).toBe('fr')
    expect(resolveLocale('fr-FR')).toBe('fr')
    expect(resolveLocale('pt_BR')).toBe('pt')
    expect(resolveLocale('auto')).toBe(detectBrowserLocale())
    expect(resolveLocale('zz')).toBe(detectBrowserLocale())
  })

  it('interpole les variables', () => {
    expect(t('fr', 'quota.remaining', { remaining: 12, limit: 15 })).toBe('12/15 restants')
    expect(t('en', 'quota.remaining', { remaining: 12, limit: 15 })).toBe('12/15 left')
  })

  it('traduit les champs CSV', () => {
    expect(fieldLabel('en', 'company_name')).toBe('Company')
    expect(fieldLabel('de', 'phone')).toBe('Telefon')
  })
})

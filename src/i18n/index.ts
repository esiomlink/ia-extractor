import { de } from './locales/de'
import { en } from './locales/en'
import { es } from './locales/es'
import { fr, type MessageKey } from './locales/fr'
import { it } from './locales/it'
import { pt } from './locales/pt'

export type { MessageKey }

export const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'it', 'pt'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export type LocaleSetting = 'auto' | Locale

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
}

const catalogs: Record<Locale, Record<MessageKey, string>> = { fr, en, es, de, it, pt }

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function detectBrowserLocale(): Locale {
  const candidates: string[] = []
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages)
    if (navigator.language) candidates.push(navigator.language)
  }
  try {
    const chromeApi = (globalThis as { chrome?: { i18n?: { getUILanguage?: () => string } } }).chrome
    const ui = chromeApi?.i18n?.getUILanguage?.()
    if (ui) candidates.push(ui)
  } catch {
    // Hors extension.
  }

  for (const raw of candidates) {
    const normalized = raw.toLowerCase().replace('_', '-')
    const exact = normalized.slice(0, 2)
    if (isLocale(exact)) return exact
  }
  return 'en'
}

export function resolveLocale(setting: LocaleSetting | string | undefined): Locale {
  if (setting && setting !== 'auto') {
    const short = setting.toLowerCase().replace('_', '-').slice(0, 2)
    if (isLocale(short)) return short
  }
  return detectBrowserLocale()
}

export function t(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = catalogs[locale]?.[key] ?? catalogs.en[key] ?? catalogs.fr[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  )
}

export function fieldLabel(locale: Locale, field: string): string {
  const key = `field.${field}` as MessageKey
  return key in catalogs.fr ? t(locale, key) : field
}

export function templateLabel(locale: Locale, templateId: string): string {
  const key = `template.${templateId}` as MessageKey
  return key in catalogs.fr ? t(locale, key) : templateId
}

export function translatedHeaders(locale: Locale, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, fieldLabel(locale, field)]))
}

export function localeFromHeader(header: string | undefined): Locale {
  if (!header) return 'en'
  const first = header.split(',')[0]?.trim().split(';')[0] ?? ''
  return resolveLocale(first.slice(0, 2).toLowerCase())
}

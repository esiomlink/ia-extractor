import { DEFAULT_API_URL } from './api'
import { isLocale } from '../i18n'
import { getTemplate } from './templates'
import type { LastExtraction, QuotaState, Settings } from './types'

const DEFAULT_QUOTA: QuotaState = { used: 0, month: '' }

export function defaultSettings(): Settings {
  const template = getTemplate('b2b_leads')
  return {
    apiUrl: DEFAULT_API_URL,
    installId: '',
    licenseKey: '',
    isPro: false,
    locale: 'auto',
    googleClientId: '',
    spreadsheetId: '',
    selectedTemplateId: template.id,
    selectedFields: [...template.fields],
  }
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(Object.keys(defaultSettings()))
  const merged: Settings = { ...defaultSettings(), ...(stored as Partial<Settings>) }
  if (merged.locale !== 'auto' && !isLocale(merged.locale)) merged.locale = 'auto'
  if (!merged.selectedFields?.length) {
    merged.selectedFields = [...getTemplate(merged.selectedTemplateId).fields]
  }
  return merged
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch }
  if (patch.selectedTemplateId && patch.selectedTemplateId !== current.selectedTemplateId && !patch.selectedFields) {
    next.selectedFields = [...getTemplate(patch.selectedTemplateId).fields]
  }
  await chrome.storage.local.set(next)
  return next
}

export async function getQuotaState(): Promise<QuotaState> {
  const stored = await chrome.storage.local.get(['used', 'month'])
  return {
    used: typeof stored.used === 'number' ? stored.used : DEFAULT_QUOTA.used,
    month: typeof stored.month === 'string' ? stored.month : DEFAULT_QUOTA.month,
  }
}

export async function saveQuotaState(state: QuotaState): Promise<void> {
  await chrome.storage.local.set(state)
}

export async function getLastExtraction(): Promise<LastExtraction | null> {
  const { lastExtraction } = await chrome.storage.local.get('lastExtraction')
  return (lastExtraction as LastExtraction | undefined) ?? null
}

export async function saveLastExtraction(extraction: LastExtraction): Promise<void> {
  await chrome.storage.local.set({ lastExtraction: extraction })
}

export async function ensureInstall(): Promise<Settings> {
  const current = await getSettings()
  const patch: Partial<Settings> = {}
  if (!current.installId) patch.installId = crypto.randomUUID()
  if (!current.apiUrl) patch.apiUrl = DEFAULT_API_URL
  if (Object.keys(patch).length) return saveSettings(patch)
  return current
}

export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (fromUrl) return fromUrl[1]
  return trimmed
}

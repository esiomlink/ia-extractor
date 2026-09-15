import type { LocaleSetting } from '../i18n'

export type Lead = Record<string, string>

export type PageContent = {
  title: string
  url: string
  markdown: string
  excerpt: string
  emails: string[]
  phones: string[]
}

export type TemplateId = 'b2b_leads' | 'directory' | 'real_estate' | 'jobs'

export type Template = {
  id: TemplateId
  label: string
  description: string
  fields: string[]
  headers: Record<string, string>
}

export type Settings = {
  apiUrl: string
  installId: string
  licenseKey: string
  isPro: boolean
  locale: LocaleSetting
  googleClientId: string
  spreadsheetId: string
  selectedTemplateId: TemplateId
  selectedFields: string[]
}

export type QuotaState = {
  used: number
  month: string
}

export type LastExtraction = {
  leads: Lead[]
  fields: string[]
  templateId: TemplateId
  sourceUrl: string
  sourceTitle: string
  extractedAt: string
}

export type ExtractSuccess = {
  ok: true
  leads: Lead[]
  fields: string[]
  quota: { used: number; remaining: number; limit: number; isPro: boolean }
  extraction: LastExtraction
}

export type ExtractFailure = {
  ok: false
  error: string
  code?: 'quota' | 'auth' | 'page' | 'llm' | 'tab'
}

export type ExtractResult = ExtractSuccess | ExtractFailure

import { t, type Locale } from '../i18n'
import { buildExtractionPrompt, normalizeLeads, parseJsonObject } from './groq'
import type { Lead, PageContent, Template } from './types'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — gratuit (recommandé)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash — gratuit, plus précis' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
] as const

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string; status?: string }
}

function schemaFor(fields: string[]) {
  const properties: Record<string, { type: string }> = {}
  for (const field of fields) properties[field] = { type: 'string' }
  return {
    type: 'object',
    properties: {
      leads: {
        type: 'array',
        items: {
          type: 'object',
          properties,
          required: fields,
        },
      },
    },
    required: ['leads'],
  }
}

export async function extractLeadsWithGemini(params: {
  apiKey: string
  model: string
  page: PageContent
  template: Template
  locale?: Locale
}): Promise<Lead[]> {
  if (!params.apiKey.trim()) throw new Error(t(params.locale ?? 'en', 'error.geminiKey'))

  const { system, user } = buildExtractionPrompt(params.page, params.template)
  const model = params.model.startsWith('gemini') ? params.model : DEFAULT_GEMINI_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': params.apiKey.trim(),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: schemaFor(params.template.fields),
      },
    }),
  })

  const locale = params.locale ?? 'en'

  const raw = await response.text()
  let parsed: GeminiResponse = {}
  try {
    parsed = JSON.parse(raw) as GeminiResponse
  } catch {
    throw new Error(t(locale, 'error.apiUnreadable', { status: response.status }))
  }

  if (!response.ok) {
    throw new Error(humanizeGeminiError(parsed.error?.message ?? `Gemini ${response.status}`, locale))
  }

  const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  if (!content.trim()) throw new Error(t(locale, 'error.noLeads'))

  const leads = normalizeLeads(parseJsonObject(content), params.template.fields)
  if (leads.length === 0) throw new Error(t(locale, 'error.noLeads'))
  return leads
}

export function humanizeGeminiError(message: string, locale: Locale = 'en'): string {
  if (/quota|rate|resource.?exhausted|429/i.test(message)) {
    return t(locale, 'error.geminiQuota')
  }
  if (/api key|permission|invalid/i.test(message)) {
    return t(locale, 'error.geminiKey')
  }
  return message
}

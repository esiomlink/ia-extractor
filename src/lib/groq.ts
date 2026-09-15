import type { Lead, PageContent, Template } from './types'

export const DEFAULT_MODEL = 'qwen/qwen3.8-27b'

export const GROQ_MODELS = [
  { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B — rapide (recommandé)' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — qualité max' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
  { id: 'qwen/qwen3.6-27b', label: 'Qwen 3.6 27B' },
] as const

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MAX_COMPLETION_TOKENS = 2_048
const FREE_TIER_INPUT_BUDGET = 6_200
const CHARS_PER_TOKEN = 3.2

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function clipMarkdown(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown
  return `${markdown.slice(0, maxChars).trim()}\n\n[contenu tronqué pour respecter le quota Groq]`
}

export function clipPageForGroq(page: PageContent, maxChars: number): PageContent {
  return {
    ...page,
    excerpt: page.excerpt.slice(0, 220),
    emails: page.emails.slice(0, 12),
    phones: page.phones.slice(0, 12),
    markdown: clipMarkdown(page.markdown, maxChars),
  }
}

export function maxCharsForBudget(system: string, page: PageContent, budget = FREE_TIER_INPUT_BUDGET): number {
  const reserved = estimateTokens(
    [
      system,
      page.url,
      page.title,
      page.excerpt.slice(0, 220),
      page.emails.slice(0, 12).join(', '),
      page.phones.slice(0, 12).join(', '),
    ].join('\n'),
  )
  const available = Math.max(1_200, (budget - reserved) * CHARS_PER_TOKEN)
  return Math.floor(available)
}

export function humanizeGroqError(message: string): string {
  if (/ITPM|input tokens per minute|rate limit|too large/i.test(message)) {
    return 'Quota Groq dépassé : la page était trop longue pour le palier gratuit (7 000 tokens / min), pas trop d’appels. Réessayez dans 20 secondes.'
  }
  return message
}

function parseTokenWindow(message: string): { limit: number; requested: number } | null {
  const limit = message.match(/Limit\s+(\d+)/i)
  const requested = message.match(/Requested\s+(\d+)/i)
  if (!limit || !requested) return null
  return { limit: Number(limit[1]), requested: Number(requested[1]) }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Réponse LLM vide')
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? trimmed).trim()
  try {
    return JSON.parse(raw)
  } catch {
    // Le modèle a parfois coupé sa réponse en plein milieu (page avec beaucoup de
    // leads, limite de tokens atteinte) : le JSON est alors invalide même après
    // avoir isolé la première accolade { ... dernière accolade }. Ce deuxième essai
    // doit rester protégé, sinon l'erreur brute de JSON.parse (illisible pour
    // l'utilisateur) remonte telle quelle jusqu'au popup.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1))
      } catch {
        throw new Error('Réponse LLM non JSON (probablement tronquée — trop de résultats pour une seule page)')
      }
    }
    throw new Error('Réponse LLM non JSON')
  }
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  Eacute: 'É',
  egrave: 'è',
  Egrave: 'È',
  ecirc: 'ê',
  Ecirc: 'Ê',
  euml: 'ë',
  agrave: 'à',
  Agrave: 'À',
  acirc: 'â',
  Acirc: 'Â',
  auml: 'ä',
  icirc: 'î',
  Icirc: 'Î',
  iuml: 'ï',
  igrave: 'ì',
  ocirc: 'ô',
  Ocirc: 'Ô',
  ouml: 'ö',
  ograve: 'ò',
  ucirc: 'û',
  Ucirc: 'Û',
  uuml: 'ü',
  ugrave: 'ù',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ntilde: 'ñ',
  oelig: 'œ',
  OElig: 'Œ',
  aelig: 'æ',
  AElig: 'Æ',
  laquo: '«',
  raquo: '»',
  deg: '°',
}

// Gemini (surtout les modèles "lite") corrompt parfois les caractères accentués dans
// une sortie JSON contrainte, en laissant échapper des entités HTML littérales
// (bien formées comme "&eacute;", ou tronquées comme "&e9"). On les décode ici en
// filet de sécurité, quel que soit le champ ou le modèle utilisé.
export function decodeHtmlEntities(value: string): string {
  if (!value || value.indexOf('&') === -1) return value
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_match, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);?/g, (match, name: string) => NAMED_HTML_ENTITIES[name] ?? match)
}

export function normalizeLeads(payload: unknown, fields: string[]): Lead[] {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Aucun lead dans la réponse')
  }
  const record = payload as Record<string, unknown>
  const list = record.leads ?? record.records ?? record.items ?? record.data
  if (!Array.isArray(list)) throw new Error('Aucun lead dans la réponse')

  return list
    .map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
      const lead: Lead = {}
      for (const field of fields) {
        const value = row[field]
        lead[field] = value == null ? '' : decodeHtmlEntities(String(value).trim())
      }
      return lead
    })
    .filter((lead) => Object.values(lead).some((value) => value.length > 0))
}

export function buildExtractionPrompt(page: PageContent, template: Template): {
  system: string
  user: string
} {
  const fieldList = template.fields.map((field) => `"${field}": "string"`).join(', ')
  const system = [
    'Tu es un extracteur B2B précis. N’invente rien. Valeur inconnue = "".',
    'JSON uniquement :',
    `{"leads":[{${fieldList}}]}`,
    'Une entrée par société/contact. summary = 1 phrase FR.',
  ].join(' ')

  const hints = [
    page.emails.length ? `Emails détectés: ${page.emails.join(', ')}` : '',
    page.phones.length ? `Téléphones détectés: ${page.phones.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const user = [
    `URL: ${page.url}`,
    `Titre: ${page.title}`,
    page.excerpt ? `Extrait: ${page.excerpt}` : '',
    hints,
    '',
    'Contenu nettoyé de la page :',
    page.markdown,
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

type GroqChoice = {
  message?: {
    content?: string | null
  }
}

type GroqResponse = {
  choices?: GroqChoice[]
  error?: { message?: string; failed_generation?: string }
}

export async function extractLeadsWithGroq(params: {
  apiKey: string
  model: string
  page: PageContent
  template: Template
}): Promise<Lead[]> {
  const { apiKey, model, template } = params
  if (!apiKey.trim()) throw new Error('Clé API Groq manquante')

  const system = buildExtractionPrompt(params.page, template).system
  let maxChars = maxCharsForBudget(system, params.page)
  let page = clipPageForGroq(params.page, maxChars)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { user } = buildExtractionPrompt(page, template)
    const result = await completeJson({ apiKey, model, system, user })
    if (result.ok) {
      const leads = normalizeLeads(parseJsonObject(result.content), template.fields)
      if (leads.length === 0) {
        throw new Error('Aucun lead exploitable trouvé sur cette page')
      }
      return leads
    }

    const window = parseTokenWindow(result.error)
    const rateLimited =
      result.status === 429 || /ITPM|tokens per minute|rate limit|too large/i.test(result.error)

    if (window && window.requested > 0) {
      maxChars = Math.max(1_200, Math.floor(maxChars * ((window.limit * 0.7) / window.requested)))
      page = clipPageForGroq(params.page, maxChars)
      continue
    }

    if (rateLimited && attempt < 2) {
      maxChars = Math.max(1_200, Math.floor(maxChars * 0.65))
      page = clipPageForGroq(params.page, maxChars)
      await sleep(8_000 * (attempt + 1))
      continue
    }

    throw new Error(humanizeGroqError(result.error))
  }

  throw new Error(humanizeGroqError('Quota Groq dépassé. Réessayez dans une minute.'))
}

async function completeJson(params: {
  apiKey: string
  model: string
  system: string
  user: string
}): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const first = await groqChat(params, true)
  if (first.ok) return first

  const jsonModeFailed = first.status === 400 && /json/i.test(first.error) && !/ITPM|too large/i.test(first.error)
  if (jsonModeFailed) {
    return groqChat(params, false)
  }

  return first
}

async function groqChat(
  params: { apiKey: string; model: string; system: string; user: string },
  jsonMode: boolean,
): Promise<{ ok: true; content: string } | { ok: false; status: number; error: string }> {
  const body: Record<string, unknown> = {
    model: params.model,
    temperature: 0.1,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.user },
    ],
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  let parsed: GroqResponse = {}
  try {
    parsed = JSON.parse(raw) as GroqResponse
  } catch {
    return { ok: false, status: response.status, error: `Réponse Groq illisible (${response.status})` }
  }

  if (!response.ok) {
    const failed = parsed.error?.failed_generation
    const message = parsed.error?.message ?? `Erreur Groq ${response.status}`
    return {
      ok: false,
      status: response.status,
      error: failed ? `${message} ${failed.slice(0, 280)}` : message,
    }
  }

  const content = parsed.choices?.[0]?.message?.content?.trim() ?? ''
  if (!content) {
    return { ok: false, status: response.status, error: 'Réponse LLM vide' }
  }
  return { ok: true, content }
}

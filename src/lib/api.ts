import type { Lead, PageContent, QuotaState } from './types'

export const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8787'

export type ApiQuota = {
  used: number
  remaining: number
  limit: number
  isPro: boolean
  month?: string
}

type ExtractOk = { ok: true; leads: Lead[]; fields: string[]; quota: ApiQuota }
type ExtractErr = { ok: false; error: string; code?: string; quota?: ApiQuota }

function headers(installId: string, licenseKey: string, locale?: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Install-Id': installId,
    'X-License-Key': licenseKey,
    'X-Locale': locale || 'en',
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`API ${response.status}`)
  }
}

export async function fetchMe(apiUrl: string, installId: string, licenseKey: string, locale?: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/me`, {
    headers: headers(installId, licenseKey, locale),
  })
  return parseJson<{ ok: boolean; quota?: ApiQuota; isPro?: boolean; error?: string }>(response)
}

export async function extractViaApi(params: {
  apiUrl: string
  installId: string
  licenseKey: string
  locale?: string
  page: PageContent
  templateId: string
  fields: string[]
}): Promise<ExtractOk | ExtractErr> {
  const response = await fetch(`${params.apiUrl.replace(/\/$/, '')}/v1/extract`, {
    method: 'POST',
    headers: headers(params.installId, params.licenseKey, params.locale),
    body: JSON.stringify({
      page: params.page,
      templateId: params.templateId,
      fields: params.fields,
    }),
  })
  return parseJson<ExtractOk | ExtractErr>(response)
}

export async function startCheckout(apiUrl: string, installId: string, locale?: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/checkout`, {
    method: 'POST',
    headers: headers(installId, '', locale),
    body: JSON.stringify({ installId }),
  })
  return parseJson<{ ok: boolean; url?: string; error?: string }>(response)
}

export async function activateLicense(apiUrl: string, installId: string, licenseKey: string, locale?: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/license`, {
    method: 'POST',
    headers: headers(installId, licenseKey, locale),
    body: JSON.stringify({ licenseKey }),
  })
  return parseJson<{ ok: boolean; quota?: ApiQuota; error?: string }>(response)
}

export function quotaToState(quota: ApiQuota): QuotaState & { isPro: boolean } {
  const now = new Date()
  const month =
    quota.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return { used: quota.used, month, isPro: quota.isPro }
}

import { parseSpreadsheetId } from './storage'
import { resolveLocale, t, type Locale } from '../i18n'
import type { Lead } from './types'

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets'

export function googleRedirectUri(): string {
  return chrome.identity.getRedirectURL()
}

export async function getGoogleAccessToken(clientId: string, locale?: Locale): Promise<string> {
  const lang = locale ?? resolveLocale('auto')
  if (!clientId.trim()) {
    throw new Error(t(lang, 'error.missingGoogleClient'))
  }

  const redirectUri = googleRedirectUri()
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId.trim())
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'token')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('prompt', 'select_account')
  authUrl.searchParams.set('include_granted_scopes', 'true')

  const responseUrl = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (url) => {
      if (chrome.runtime.lastError || !url) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Connexion Google annulée'))
        return
      }
      resolve(url)
    })
  })

  const hash = new URL(responseUrl).hash.replace(/^#/, '')
  const token = new URLSearchParams(hash).get('access_token')
  if (!token) throw new Error(t(lang, 'error.googleToken'))
  return token
}

async function sheetsApi<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Erreur Google Sheets (${response.status})`)
  }
  return payload
}

export async function createSpreadsheet(
  token: string,
  title: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  return sheetsApi(token, 'spreadsheets', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Leads' } }],
    }),
  })
}

export async function appendLeadsToSheet(params: {
  token: string
  spreadsheetId: string
  headers: string[]
  rows: string[][]
}): Promise<void> {
  const sheetId = parseSpreadsheetId(params.spreadsheetId)
  if (!sheetId) throw new Error(t(resolveLocale('auto'), 'error.missingSheet'))

  const meta = await sheetsApi<{ sheets?: { properties?: { title?: string } }[] }>(
    params.token,
    `spreadsheets/${sheetId}`,
  )
  const tab = meta.sheets?.[0]?.properties?.title ?? 'Feuille 1'
  const encodedRange = encodeURIComponent(`${tab}!A1`)

  const existing = await sheetsApi<{ values?: string[][] }>(
    params.token,
    `spreadsheets/${sheetId}/values/${encodedRange}?majorDimension=ROWS`,
  )

  const hasHeader = Boolean(existing.values?.[0]?.length)
  const values = hasHeader ? params.rows : [params.headers, ...params.rows]

  await sheetsApi(
    params.token,
    `spreadsheets/${sheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values }),
    },
  )
}

export function leadsToRows(
  leads: Lead[],
  fields: string[],
  headers: Record<string, string>,
): { headers: string[]; rows: string[][] } {
  return {
    headers: fields.map((field) => headers[field] ?? field),
    rows: leads.map((lead) => fields.map((field) => lead[field] ?? '')),
  }
}

import { extractViaApi, fetchMe, quotaToState, startCheckout } from '../lib/api'
import { resolveLocale, t, translatedHeaders, type Locale, type MessageKey } from '../i18n'
import { resolveQuota } from '../lib/quota'
import {
  appendLeadsToSheet,
  createSpreadsheet,
  getGoogleAccessToken,
  leadsToRows,
} from '../lib/sheets'
import {
  ensureInstall,
  getLastExtraction,
  getQuotaState,
  getSettings,
  saveLastExtraction,
  saveQuotaState,
  saveSettings,
} from '../lib/storage'
import { getTemplate } from '../lib/templates'
import type { ExtractResult, LastExtraction, PageContent } from '../lib/types'

chrome.runtime.onInstalled.addListener(() => {
  void ensureInstall()
})

function localeOf(settings: { locale: string }): Locale {
  return resolveLocale(settings.locale)
}

function msg(locale: Locale, key: MessageKey, vars?: Record<string, string | number>) {
  return t(locale, key, vars)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch(async (error: unknown) => {
      const settings = await getSettings().catch(() => null)
      const locale = localeOf(settings ?? { locale: 'auto' })
      const text = error instanceof Error ? error.message : msg(locale, 'error.unexpected')
      sendResponse({ ok: false, error: text })
    })
  return true
})

async function handleMessage(message: { type?: string; [key: string]: unknown }) {
  switch (message.type) {
    case 'GET_STATE':
      return getUiState()
    case 'EXTRACT_CURRENT_TAB':
      return extractCurrentTab(typeof message.tabId === 'number' ? message.tabId : undefined)
    case 'START_CHECKOUT':
      return beginCheckout()
    case 'EXPORT_SHEETS':
      return exportSheets()
    case 'CREATE_SHEET':
      return createAndExportSheet()
    default:
      return { ok: false, error: msg(localeOf(await getSettings()), 'error.unknownMessage') }
  }
}

async function getUiState() {
  const settings = await ensureInstall()
  let quota = resolveQuota(await getQuotaState(), settings.isPro)
  try {
    const me = await fetchMe(settings.apiUrl, settings.installId, settings.licenseKey, localeOf(settings))
    if (me.ok && me.quota) {
      quota = {
        used: me.quota.used,
        remaining: me.quota.remaining,
        limit: me.quota.limit,
        isPro: me.quota.isPro,
        month: me.quota.month ?? '',
      }
      await saveQuotaState(quotaToState(me.quota))
      if (me.quota.isPro !== settings.isPro) await saveSettings({ isPro: me.quota.isPro })
    }
  } catch {
    // Serveur down: on affiche le dernier quota connu.
  }
  const lastExtraction = await getLastExtraction()
  return { ok: true, settings: await getSettings(), quota, lastExtraction }
}

async function extractCurrentTab(tabIdHint?: number): Promise<ExtractResult> {
  const settings = await ensureInstall()
  const locale = localeOf(settings)
  const tab = tabIdHint
    ? await chrome.tabs.get(tabIdHint).catch(() => getActiveTab())
    : await getActiveTab()
  if (!tab?.id) return { ok: false, code: 'tab', error: msg(locale, 'error.noTab') }
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    return {
      ok: false,
      code: 'tab',
      error: msg(locale, 'error.badTab'),
    }
  }

  const page = await scrapeTab(tab.id, locale)
  const template = getTemplate(settings.selectedTemplateId)
  const fields = settings.selectedFields.filter((field) => template.fields.includes(field))
  const usedFields = fields.length ? fields : template.fields

  let result
  try {
    result = await extractViaApi({
      apiUrl: settings.apiUrl,
      installId: settings.installId,
      licenseKey: settings.licenseKey,
      locale,
      page,
      templateId: template.id,
      fields: usedFields,
    })
  } catch {
    return {
      ok: false,
      code: 'llm',
      error: msg(locale, 'error.apiDown'),
    }
  }

  if (!result.ok) {
    if (result.quota) {
      await saveQuotaState(quotaToState(result.quota))
      await saveSettings({ isPro: result.quota.isPro })
    }
    return { ok: false, code: result.code === 'quota' ? 'quota' : 'llm', error: result.error }
  }

  await saveQuotaState(quotaToState(result.quota))
  await saveSettings({ isPro: result.quota.isPro })

  const extraction: LastExtraction = {
    leads: result.leads,
    fields: result.fields,
    templateId: template.id,
    sourceUrl: page.url,
    sourceTitle: page.title,
    extractedAt: new Date().toISOString(),
  }
  await saveLastExtraction(extraction)

  return {
    ok: true,
    leads: result.leads,
    fields: result.fields,
    quota: result.quota,
    extraction,
  }
}

async function beginCheckout() {
  const settings = await ensureInstall()
  const locale = localeOf(settings)
  const result = await startCheckout(settings.apiUrl, settings.installId, locale)
  if (!result.ok || !result.url) return { ok: false, error: result.error ?? msg(locale, 'error.checkout') }
  await chrome.tabs.create({ url: result.url })
  return { ok: true }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function scrapeTab(tabId: number, locale: Locale): Promise<PageContent> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' })
    if (response?.ok && response.data) return response.data as PageContent
    if (response?.error) throw new Error(String(response.error))
  } catch {
    // The content script may be missing on pages opened before install.
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeInline,
  })
  const page = injection?.result
  if (!page?.markdown) {
    throw new Error(msg(locale, 'error.reloadPage'))
  }
  return page
}

function scrapeInline(): PageContent {
  const kill = 'script, style, noscript, iframe, svg, nav, footer, header'
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll(kill).forEach((node) => node.remove())
  const markdown = (clone.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 40_000)
  const text = `${document.title}\n${document.body?.innerText ?? ''}`
  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])]
  const phones = [
    ...new Set(
      text.match(/(?:\+33|0033|0)\s*[1-9](?:[\s.-]?\d{2}){4}|\+\d{1,3}[\s.-]?(?:\d[\s.-]?){6,14}\d/g) ??
        [],
    ),
  ]
  return {
    title: document.title,
    url: location.href,
    markdown,
    excerpt: '',
    emails,
    phones,
  }
}

async function exportSheets() {
  const settings = await getSettings()
  const locale = localeOf(settings)
  const extraction = await getLastExtraction()
  if (!extraction?.leads.length) throw new Error(msg(locale, 'error.noExtraction'))
  const token = await getGoogleAccessToken(settings.googleClientId, locale)

  let spreadsheetId = settings.spreadsheetId
  let spreadsheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
    : ''

  if (!spreadsheetId) {
    const created = await createSpreadsheet(
      token,
      `IA Extractor — ${extraction.sourceTitle || 'Leads'}`,
    )
    spreadsheetId = created.spreadsheetId
    spreadsheetUrl = created.spreadsheetUrl
    await saveSettings({ spreadsheetId })
  }

  const table = leadsToRows(extraction.leads, extraction.fields, translatedHeaders(locale, extraction.fields))
  await appendLeadsToSheet({
    token,
    spreadsheetId,
    headers: table.headers,
    rows: table.rows,
  })

  return { ok: true, spreadsheetId, spreadsheetUrl }
}

async function createAndExportSheet() {
  await saveSettings({ spreadsheetId: '' })
  return exportSheets()
}

Object.assign(globalThis, { __extractCurrentTab: extractCurrentTab })

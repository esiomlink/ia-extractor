import {
  Building2,
  Check,
  ClipboardCopy,
  Download,
  Loader2,
  Mail,
  Phone,
  Settings as SettingsIcon,
  Sheet,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { defaultCsvFilename, toCsv, toTsv } from '../lib/csv'
import { fieldLabel, resolveLocale, t, templateLabel, translatedHeaders, type MessageKey } from '../i18n'
import { modelLabel } from '../lib/llm'
import { FREE_MONTHLY_LIMIT } from '../lib/quota'
import { saveSettings } from '../lib/storage'
import { TEMPLATE_LIST, getTemplate } from '../lib/templates'
import type { ExtractResult, LastExtraction, Settings } from '../lib/types'

type QuotaViewLike = {
  used: number
  remaining: number
  limit: number
  isPro: boolean
}

type UiState = {
  settings: Settings
  quota: QuotaViewLike
  lastExtraction: LastExtraction | null
}

const STEPS: MessageKey[] = ['popup.step.dom', 'popup.step.readability', 'popup.step.gemini', 'popup.step.json']

function send<T>(message: { type: string; tabId?: number }): Promise<T> {
  return chrome.runtime.sendMessage(message)
}

export default function App() {
  const [state, setState] = useState<UiState | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const next = await send<UiState & { ok: boolean; error?: string }>({ type: 'GET_STATE' })
    if (!next?.ok && 'error' in next && next.error) {
      setError(next.error)
      return
    }
    setState(next)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!busy) return
    setStep(0)
    const timer = window.setInterval(() => {
      setStep((current) => (current < STEPS.length - 1 ? current + 1 : current))
    }, 700)
    return () => window.clearInterval(timer)
  }, [busy])

  const extraction = state?.lastExtraction ?? null
  const settings = state?.settings
  const quota = state?.quota
  const locale = resolveLocale(settings?.locale)
  const template = getTemplate(extraction?.templateId ?? settings?.selectedTemplateId)
  const headers = translatedHeaders(locale, extraction?.fields ?? template.fields)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const remainingLabel = useMemo(() => {
    if (!quota) return ''
    if (quota.isPro) return t(locale, 'quota.pro')
    const remaining = Number.isFinite(quota.remaining) ? quota.remaining : 0
    return t(locale, 'quota.remaining', { remaining, limit: FREE_MONTHLY_LIMIT })
  }, [quota, locale])

  async function extract() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const result = await send<ExtractResult>({
        type: 'EXTRACT_CURRENT_TAB',
        tabId: tab?.id,
      })
      if (!result.ok) {
        setError(result.error)
        await load()
        return
      }
      setState((current) =>
        current
          ? { ...current, lastExtraction: result.extraction, quota: result.quota }
          : current,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, 'popup.extractFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function changeTemplate(id: Settings['selectedTemplateId']) {
    const next = await saveSettings({ selectedTemplateId: id })
    setState((current) => (current ? { ...current, settings: next } : current))
  }

  async function toggleField(field: string) {
    if (!settings) return
    const selected = settings.selectedFields.includes(field)
      ? settings.selectedFields.filter((item) => item !== field)
      : [...settings.selectedFields, field]
    const next = await saveSettings({ selectedFields: selected.length ? selected : [field] })
    setState((current) => (current ? { ...current, settings: next } : current))
  }

  async function exportCsv() {
    if (!extraction) return
    const csv = toCsv(extraction.leads, extraction.fields, headers)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    await chrome.downloads.download({
      url,
      filename: defaultCsvFilename('leads-b2b'),
      saveAs: true,
    })
    window.setTimeout(() => URL.revokeObjectURL(url), 8_000)
    setNotice(t(locale, 'popup.csvReady'))
  }

  async function copyTsv() {
    if (!extraction) return
    const tsv = toTsv(extraction.leads, extraction.fields, headers)
    await navigator.clipboard.writeText(tsv)
    setCopied(true)
    setNotice(t(locale, 'popup.tsvCopied'))
    window.setTimeout(() => setCopied(false), 1600)
  }

  async function exportSheets() {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const result = await send<{ ok: boolean; error?: string; spreadsheetUrl?: string }>({
        type: 'EXPORT_SHEETS',
      })
      if (!result.ok) {
        setError(result.error ?? t(locale, 'popup.sheetsFailed'))
        return
      }
      setNotice(t(locale, 'popup.sheetsOk'))
      if (result.spreadsheetUrl) await chrome.tabs.create({ url: result.spreadsheetUrl })
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, 'popup.sheetsFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!state || !settings || !quota) {
    return (
      <Shell>
        <div className="flex min-h-[540px] items-center justify-center text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mint">{t(locale, 'brandTag')}</p>
            <h1 className="text-[15px] font-semibold leading-none">{t(locale, 'brandShort')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line bg-white/5 px-2.5 py-1 text-[11px] text-muted">
            {remainingLabel}
          </span>
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="rounded-full border border-line p-1.5 text-muted hover:text-ink"
            title={t(locale, 'popup.options')}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="px-4">
        <div className="flex gap-1.5 overflow-x-auto pb-3">
          {TEMPLATE_LIST.map((item) => {
            const active = settings.selectedTemplateId === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void changeTemplate(item.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  active
                    ? 'bg-mint text-slate-950'
                    : 'border border-line bg-white/4 text-muted hover:text-ink'
                }`}
              >
                {templateLabel(locale, item.id)}
              </button>
            )
          })}
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {getTemplate(settings.selectedTemplateId).fields.map((field) => {
            const on = settings.selectedFields.includes(field)
            return (
              <button
                key={field}
                type="button"
                onClick={() => void toggleField(field)}
                className={`rounded-md px-2 py-1 text-[10px] ${
                  on ? 'bg-sky/15 text-sky' : 'bg-white/4 text-muted'
                }`}
              >
                {fieldLabel(locale, field)}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          disabled={busy || (!quota.isPro && quota.remaining <= 0)}
          onClick={() => void extract()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-mint to-mint-2 px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgb(45_212_167_/_0.18)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? t(locale, 'popup.extracting') : t(locale, 'popup.extract')}
        </button>

        {busy ? (
          <ol className="mt-3 space-y-1.5">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={`flex items-center gap-2 text-[11px] ${index <= step ? 'text-ink' : 'text-muted/60'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${index <= step ? 'bg-mint' : 'bg-white/20'}`}
                />
                {t(locale, label)}
              </li>
            ))}
          </ol>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-lg border border-mint/30 bg-mint/10 px-3 py-2 text-[12px] text-mint-2">
            {notice}
          </p>
        ) : null}

        {!quota.isPro && quota.remaining <= 0 ? (
          <div className="mt-3 rounded-xl border border-line bg-white/4 p-3">
            <p className="text-sm font-medium">{t(locale, 'popup.proTitle')}</p>
            <p className="mt-1 text-[12px] text-muted">
              {t(locale, 'popup.proBody')}
            </p>
            <button
              type="button"
              className="mt-2 text-[12px] font-semibold text-sky"
              onClick={() => void send({ type: 'START_CHECKOUT' })}
            >
              {t(locale, 'popup.pay')}
            </button>
          </div>
        ) : null}
      </div>

      <section className="mt-4 flex-1 overflow-y-auto px-4 pb-4">
        {extraction?.leads.length ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {extraction.leads.length === 1
                  ? t(locale, 'popup.leads_one', {
                      count: extraction.leads.length,
                      host: new URL(extraction.sourceUrl || 'https://local').hostname,
                    })
                  : t(locale, 'popup.leads_other', {
                      count: extraction.leads.length,
                      host: new URL(extraction.sourceUrl || 'https://local').hostname,
                    })}
              </p>
            </div>
            <div className="space-y-2">
              {extraction.leads.map((lead, index) => (
                <article key={`${lead.email}-${index}`} className="rounded-xl border border-line bg-white/4 p-3">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    <Building2 className="h-3.5 w-3.5 text-mint" />
                    {lead.company_name || lead.title || t(locale, 'popup.unnamed')}
                  </p>
                  {lead.contact_name || lead.job_title ? (
                    <p className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                      <UserRound className="h-3.5 w-3.5" />
                      {[lead.contact_name, lead.job_title].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {lead.email ? (
                    <p className="mt-1 flex items-center gap-2 text-[12px] text-sky">
                      <Mail className="h-3.5 w-3.5" />
                      {lead.email}
                    </p>
                  ) : null}
                  {lead.phone ? (
                    <p className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                      <Phone className="h-3.5 w-3.5" />
                      {lead.phone}
                    </p>
                  ) : null}
                  {lead.summary ? <p className="mt-2 text-[11px] leading-5 text-muted">{lead.summary}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
            <p className="text-sm font-medium">{t(locale, 'popup.emptyTitle')}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted">
              {t(locale, 'popup.emptyBody')}
            </p>
          </div>
        )}
      </section>

      <footer className="border-t border-line px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <ExportButton
            disabled={!extraction || busy}
            icon={Download}
            label={t(locale, 'popup.csv')}
            onClick={() => void exportCsv()}
          />
          <ExportButton
            disabled={!extraction || busy}
            icon={copied ? Check : ClipboardCopy}
            label={copied ? t(locale, 'popup.copied') : t(locale, 'popup.copy')}
            onClick={() => void copyTsv()}
          />
          <ExportButton
            disabled={!extraction || busy}
            icon={Sheet}
            label={t(locale, 'popup.oauth')}
            onClick={() => void exportSheets()}
          />
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">
          {modelLabel(settings.locale)}
        </p>
      </footer>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[580px] w-[400px] flex-col bg-[radial-gradient(1200px_circle_at_0%_-10%,rgb(45_212_167_/_0.12),transparent_40%),radial-gradient(900px_circle_at_100%_0%,rgb(56_189_248_/_0.10),transparent_38%),#07101c]">
      {children}
    </div>
  )
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0b1224" stroke="rgb(255 255 255 / 0.1)" />
      <path d="M8 10h16M11 14l5 8 5-8" stroke="#2dd4a7" strokeWidth="2" strokeLinecap="round" />
      <path d="M14.5 22h3" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ExportButton({
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  disabled: boolean
  icon: typeof Download
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white/5 py-2 text-[11px] font-medium text-ink disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

import { Check, Copy, Globe, KeyRound, Shield, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { activateLicense, quotaToState } from '../lib/api'
import { FREE_MONTHLY_LIMIT } from '../lib/quota'
import { googleRedirectUri } from '../lib/sheets'
import { ensureInstall, getQuotaState, saveQuotaState, saveSettings } from '../lib/storage'
import { LOCALE_NAMES, SUPPORTED_LOCALES, resolveLocale, t, type LocaleSetting } from '../i18n'
import type { Settings } from '../lib/types'

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [redirectUri, setRedirectUri] = useState('')
  const [quotaUsed, setQuotaUsed] = useState(0)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')

  const locale = resolveLocale(settings?.locale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    void (async () => {
      const next = await ensureInstall()
      setSettings(next)
      const quota = await getQuotaState()
      setQuotaUsed(quota.used)
      try {
        setRedirectUri(googleRedirectUri())
      } catch {
        setRedirectUri('')
      }
    })()
  }, [])

  async function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return
    const next = await saveSettings({ [key]: value })
    setSettings(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1200)
  }

  async function copyRedirect() {
    if (!redirectUri) return
    await navigator.clipboard.writeText(redirectUri)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  async function payPro() {
    const result = await chrome.runtime.sendMessage({ type: 'START_CHECKOUT' })
    if (!result?.ok) setNotice(result?.error ?? t(locale, 'error.checkout'))
  }

  async function saveLicense() {
    if (!settings) return
    const result = await activateLicense(
      settings.apiUrl,
      settings.installId,
      settings.licenseKey,
      locale,
    )
    if (!result.ok) {
      setNotice(result.error ?? t(locale, 'error.invalidLicense'))
      return
    }
    if (result.quota) {
      await saveQuotaState(quotaToState(result.quota))
      setQuotaUsed(result.quota.used)
      setSettings(await saveSettings({ licenseKey: settings.licenseKey, isPro: result.quota.isPro }))
    }
    setSaved(true)
    setNotice(t(locale, 'options.licenseOk'))
  }

  if (!settings) {
    return <div className="p-8 text-muted">{t(locale, 'loading')}</div>
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(900px_circle_at_10%_-10%,rgb(45_212_167_/_0.12),transparent_36%),#07101c] px-6 py-10 text-ink">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mint">{t(locale, 'brand')}</p>
        <h1 className="mt-2 text-3xl font-semibold">{t(locale, 'options.title')}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {t(locale, 'options.subtitle', { limit: FREE_MONTHLY_LIMIT })}
        </p>

        <section className="mt-8 rounded-2xl border border-line bg-white/4 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Globe className="h-4 w-4 text-sky" />
            {t(locale, 'options.language')}
          </div>
          <select
            value={settings.locale}
            onChange={(event) => void update('locale', event.target.value as LocaleSetting)}
            className="w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2.5 text-sm outline-none"
          >
            <option value="auto">{t(locale, 'options.localeAuto')}</option>
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </section>

        <section className="mt-5 rounded-2xl border border-line bg-white/4 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-mint" />
            {t(locale, 'options.proTitle')}
          </div>
          <p className="text-[12px] text-muted">
            {settings.isPro
              ? t(locale, 'options.proActive')
              : t(locale, 'options.proUsage', { used: quotaUsed, limit: FREE_MONTHLY_LIMIT })}
          </p>
          <button
            type="button"
            onClick={() => void payPro()}
            className="mt-4 rounded-xl bg-mint px-4 py-2.5 text-sm font-semibold text-slate-950"
          >
            {t(locale, 'options.pay')}
          </button>
          <label className="mt-4 block text-[12px] text-muted">{t(locale, 'options.license')}</label>
          <div className="mt-1 flex gap-2">
            <input
              value={settings.licenseKey}
              onChange={(event) => setSettings({ ...settings, licenseKey: event.target.value })}
              className="w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2.5 text-sm outline-none"
              placeholder="B2B-PRO-UNLIMITED"
            />
            <button
              type="button"
              onClick={() => void saveLicense()}
              className="rounded-xl border border-line px-3 text-[12px] text-sky"
            >
              {t(locale, 'options.activate')}
            </button>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-line bg-white/4 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-sky" />
            {t(locale, 'options.sheets')}
          </div>
          <p className="text-[12px] leading-5 text-muted">
            {t(locale, 'options.extId')}
            <code className="mx-1 rounded bg-black/30 px-1">nolbmbaeocmhhbodopbckkcinejimaee</code>
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={redirectUri || t(locale, 'options.redirectHint')}
              className="w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2 text-[12px]"
            />
            <button type="button" onClick={() => void copyRedirect()} className="rounded-xl border border-line px-3 text-muted">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <label className="mt-4 block text-[12px] text-muted">{t(locale, 'options.googleClient')}</label>
          <input
            value={settings.googleClientId}
            onChange={(event) => setSettings({ ...settings, googleClientId: event.target.value })}
            onBlur={(event) => void update('googleClientId', event.target.value.trim())}
            className="mt-1 w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2.5 text-sm outline-none focus:border-sky"
            placeholder="xxxxx.apps.googleusercontent.com"
          />
          <label className="mt-4 block text-[12px] text-muted">{t(locale, 'options.spreadsheet')}</label>
          <input
            value={settings.spreadsheetId}
            onChange={(event) => setSettings({ ...settings, spreadsheetId: event.target.value })}
            onBlur={(event) => void update('spreadsheetId', event.target.value.trim())}
            className="mt-1 w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2.5 text-sm outline-none"
            placeholder="https://docs.google.com/spreadsheets/d/…"
          />
        </section>

        <section className="mt-5 rounded-2xl border border-line bg-white/4 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-mint" />
            {t(locale, 'options.server')}
          </div>
          <label className="block text-[12px] text-muted">{t(locale, 'options.apiUrl')}</label>
          <input
            value={settings.apiUrl}
            onChange={(event) => setSettings({ ...settings, apiUrl: event.target.value })}
            onBlur={(event) => void update('apiUrl', event.target.value.trim())}
            className="mt-1 w-full rounded-xl border border-line bg-[#0b1220] px-3 py-2.5 text-sm outline-none"
          />
          <p className="mt-2 text-[11px] text-muted">
            {t(locale, 'options.installId', { id: settings.installId || '…' })}
          </p>
        </section>

        {saved ? <p className="mt-4 text-[12px] text-mint">{t(locale, 'options.saved')}</p> : null}
        {notice ? <p className="mt-2 text-[12px] text-sky">{notice}</p> : null}
      </div>
    </div>
  )
}

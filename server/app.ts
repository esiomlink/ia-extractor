import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { extractLeadsWithGemini } from '../src/lib/gemini.ts'
import { localeFromHeader, resolveLocale, t, type Locale } from '../src/i18n/index.ts'
import { FREE_MONTHLY_LIMIT } from '../src/lib/quota.ts'
import { getTemplate } from '../src/lib/templates.ts'
import type { PageContent } from '../src/lib/types.ts'
import type { UserStore } from './store-core.ts'
import type { KvNamespace } from './store-kv.ts'

export type WorkerBindings = {
  USERS?: KvNamespace
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  PUBLIC_URL?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  STRIPE_WEBHOOK_SECRET?: string
}

export type RuntimeConfig = {
  geminiApiKey: string
  geminiModel: string
  publicUrl: string
  stripeSecretKey: string
  stripePriceId: string
  stripeWebhookSecret: string
}

export type AppEnv = {
  Bindings: WorkerBindings
  Variables: {
    store: UserStore
    config: RuntimeConfig
  }
}

function requestLocale(c: { req: { header: (name: string) => string | undefined } }): Locale {
  return resolveLocale(c.req.header('X-Locale') || localeFromHeader(c.req.header('Accept-Language')))
}

export function createApp(init: (c: { req: { url: string }; env: WorkerBindings }) => { store: UserStore; config: RuntimeConfig }) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    const ctx = init(c)
    c.set('store', ctx.store)
    c.set('config', ctx.config)
    await next()
  })

  app.use(
    '*',
    cors({
      origin: (origin, c) => {
        const publicUrl = c.get('config').publicUrl
        if (!origin) return publicUrl
        if (origin.startsWith('chrome-extension://')) return origin
        if (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')) return origin
        return publicUrl
      },
      allowHeaders: ['Content-Type', 'X-Install-Id', 'X-License-Key', 'X-Locale'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  )

  app.get('/health', (c) => {
    const config = c.get('config')
    return c.json({ ok: true, gemini: Boolean(config.geminiApiKey), stripe: Boolean(config.stripeSecretKey) })
  })

  app.get('/', (c) =>
    c.html(`<!doctype html><meta charset="utf-8" /><title>Extracteur IA API</title>
    <body style="font-family:system-ui;background:#07101c;color:#e7eef9;padding:40px">
    <p>API Extracteur IA — Gemini côté serveur.</p>
    <p>Extension : 15 extraits gratuits / mois, Pro 15 €.</p>
    </body>`),
  )

  app.get('/pro-ok', (c) =>
    c.html(`<!doctype html><meta charset="utf-8" /><title>Pro activé</title>
    <body style="font-family:system-ui;background:#07101c;color:#e7eef9;padding:48px">
    <h1>Vous êtes Pro</h1>
    <p>Retournez à l’extension Chrome : les exports sont illimités.</p>
    </body>`),
  )

  app.get('/v1/me', async (c) => {
    const locale = requestLocale(c)
    const store = c.get('store')
    const installId = c.req.header('X-Install-Id') || ''
    if (!installId) return c.json({ ok: false, error: t(locale, 'error.missingInstall') }, 400)
    const licenseKey = c.req.header('X-License-Key') || ''
    const user = licenseKey ? await store.applyLicense(installId, licenseKey) : await store.getUser(installId)
    const quota = store.userQuota(user)
    return c.json({ ok: true, quota, isPro: quota.isPro })
  })

  app.post('/v1/license', async (c) => {
    const locale = requestLocale(c)
    const store = c.get('store')
    const installId = c.req.header('X-Install-Id') || ''
    const body = (await c.req.json()) as { licenseKey?: string }
    if (!installId || !body.licenseKey) return c.json({ ok: false, error: t(locale, 'error.incompleteLicense') }, 400)
    const user = await store.applyLicense(installId, body.licenseKey)
    const quota = store.userQuota(user)
    if (!quota.isPro) return c.json({ ok: false, error: t(locale, 'error.invalidLicense') }, 400)
    return c.json({ ok: true, quota })
  })

  app.post('/v1/extract', async (c) => {
    const locale = requestLocale(c)
    const store = c.get('store')
    const config = c.get('config')
    if (!config.geminiApiKey) {
      return c.json({ ok: false, error: t(locale, 'error.geminiMissing') }, 500)
    }
    const installId = c.req.header('X-Install-Id') || ''
    if (!installId) return c.json({ ok: false, error: t(locale, 'error.missingInstall') }, 400)

    const body = (await c.req.json()) as {
      page?: PageContent
      templateId?: string
      fields?: string[]
    }
    const page = body.page
    if (!page?.markdown || page.markdown.length > 50_000) {
      return c.json({ ok: false, error: t(locale, 'error.invalidPage') }, 400)
    }

    const template = getTemplate(body.templateId)
    const fields = (body.fields ?? template.fields).filter((field) => template.fields.includes(field))
    const usedFields = fields.length ? fields : template.fields

    const allowed = await store.peekExtract(installId, c.req.header('X-License-Key') || '')
    if (!allowed.ok) {
      return c.json(
        {
          ok: false,
          code: 'quota',
          error: t(locale, 'error.quota', { limit: FREE_MONTHLY_LIMIT }),
          quota: allowed.quota,
        },
        402,
      )
    }

    try {
      const leads = await extractLeadsWithGemini({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        page,
        template: { ...template, fields: usedFields },
        locale,
      })
      const quota = await store.consumeExtract(installId)
      return c.json({ ok: true, leads, fields: usedFields, quota })
    } catch (error) {
      const text = error instanceof Error ? error.message : t(locale, 'error.unexpected')
      return c.json({ ok: false, error: text, quota: allowed.quota }, 502)
    }
  })

  app.post('/v1/checkout', async (c) => {
    const locale = requestLocale(c)
    const config = c.get('config')
    const installId = c.req.header('X-Install-Id') || ((await c.req.json()) as { installId?: string }).installId || ''
    if (!installId) return c.json({ ok: false, error: t(locale, 'error.missingInstall') }, 400)
    if (!config.stripeSecretKey || !config.stripePriceId) {
      return c.json({ ok: false, error: t(locale, 'error.stripeUnconfigured') }, 501)
    }

    const params = new URLSearchParams({
      mode: 'subscription',
      client_reference_id: installId,
      success_url: `${config.publicUrl}/pro-ok`,
      cancel_url: `${config.publicUrl}/`,
      'line_items[0][price]': config.stripePriceId,
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'true',
    })

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
    const session = (await response.json()) as { url?: string; error?: { message?: string } }
    if (!response.ok || !session.url) {
      return c.json({ ok: false, error: session.error?.message ?? t(locale, 'error.checkout') }, 502)
    }
    return c.json({ ok: true, url: session.url })
  })

  app.post('/v1/stripe-webhook', async (c) => {
    const store = c.get('store')
    const config = c.get('config')
    const raw = await c.req.text()
    if (config.stripeWebhookSecret) {
      const sig = c.req.header('stripe-signature') || ''
      if (!(await verifyStripeSignature(raw, sig, config.stripeWebhookSecret))) {
        return c.json({ ok: false, error: 'Signature Stripe invalide' }, 400)
      }
    }
    const event = JSON.parse(raw) as {
      type?: string
      data?: {
        object?: {
          client_reference_id?: string
          customer?: string
          subscription?: string
          id?: string
        }
      }
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object
      const installId = session?.client_reference_id
      if (installId) {
        await store.setProFromStripe(installId, {
          customerId: typeof session?.customer === 'string' ? session.customer : undefined,
          subscriptionId: typeof session?.subscription === 'string' ? session.subscription : undefined,
        })
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const subId = event.data?.object?.id
      if (subId) await store.clearProBySubscription(subId)
    }
    return c.json({ received: true })
  })

  return app
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((item) => item.split('=')))
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

import './load-env.ts'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createFileStore } from './store.ts'

const PORT = Number(process.env.PORT || 8787)
const PUBLIC_URL = process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`
const store = createFileStore()

const app = createApp(() => ({
  store,
  config: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    publicUrl: PUBLIC_URL,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripePriceId: process.env.STRIPE_PRICE_ID || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
}))

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => {
  console.log(`Extracteur IA API → ${PUBLIC_URL}`)
  if (!process.env.GEMINI_API_KEY) console.warn('Attention : GEMINI_API_KEY manquante')
})

import { createApp, type RuntimeConfig, type WorkerBindings } from './app.ts'
import { createKvStore } from './store-kv.ts'

function configFromEnv(env: WorkerBindings, requestUrl: string): RuntimeConfig {
  return {
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    publicUrl: env.PUBLIC_URL || new URL(requestUrl).origin,
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripePriceId: env.STRIPE_PRICE_ID || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  }
}

const app = createApp((c) => {
  if (!c.env.USERS) throw new Error('Binding KV USERS manquant')
  return {
    store: createKvStore(c.env.USERS),
    config: configFromEnv(c.env, c.req.url),
  }
})

export default app

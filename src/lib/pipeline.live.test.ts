import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { extractPage } from './extract'
import { extractLeadsWithGemini } from './gemini'
import { getTemplate } from './templates'

function loadServerEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), 'server/.env'), 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {
    // ignore
  }
}

loadServerEnv()

const live = Boolean(process.env.LIVE_GEMINI || process.env.GEMINI_API_KEY)

describe.runIf(live)('pipeline live Gemini', () => {
  it('extrait plusieurs leads depuis la page démo', async () => {
    const html = readFileSync(resolve(process.cwd(), 'demo/annuaire-b2b.html'), 'utf8')
    const page = extractPage(
      new JSDOM(html, { url: 'https://demo.smartextractor.local/annuaire-b2b' }).window.document,
    )
    const apiKey = process.env.GEMINI_API_KEY
    expect(apiKey).toBeTruthy()
    const leads = await extractLeadsWithGemini({
      apiKey: apiKey!,
      model: 'gemini-3.5-flash-lite',
      page,
      template: getTemplate('b2b_leads'),
    })
    expect(leads.length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(leads).toLowerCase()).toContain('@')
  })
})

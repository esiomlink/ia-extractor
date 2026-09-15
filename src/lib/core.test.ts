import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { extractEmails, extractPhones } from './contacts'
import { csvEscape, toCsv, toTsv } from './csv'
import { extractPage } from './extract'
import { clipMarkdown, estimateTokens, maxCharsForBudget, normalizeLeads, parseJsonObject } from './groq'
import { canExtract, FREE_MONTHLY_LIMIT, monthKey, resolveQuota } from './quota'

describe('csv', () => {
  it('échappe les virgules et quotes', () => {
    expect(csvEscape('Acme, Inc')).toBe('"Acme, Inc"')
    expect(csvEscape('Il a dit "ok"')).toBe('"Il a dit ""ok"""')
  })

  it('génère un CSV UTF-8 avec BOM', () => {
    const csv = toCsv(
      [{ company_name: 'Acme, Inc', email: 'a@acme.fr' }],
      ['company_name', 'email'],
      { company_name: 'Entreprise', email: 'Email' },
    )
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"Acme, Inc",a@acme.fr')
  })

  it('génère un TSV collable dans Sheets', () => {
    const tsv = toTsv(
      [{ company_name: 'Nordik', contact_name: 'Léa' }],
      ['company_name', 'contact_name'],
      { company_name: 'Entreprise', contact_name: 'Contact' },
    )
    expect(tsv.split('\n')[0]).toBe('Entreprise\tContact')
    expect(tsv).toContain('Nordik\tLéa')
  })
})

describe('quota', () => {
  it('réinitialise au changement de mois', () => {
    const view = resolveQuota({ used: 15, month: '2026-01' }, false, new Date('2026-09-15'))
    expect(view.used).toBe(0)
    expect(view.remaining).toBe(FREE_MONTHLY_LIMIT)
    expect(view.month).toBe('2026-09')
  })

  it('bloque le gratuit à 15', () => {
    const view = resolveQuota({ used: 15, month: monthKey(new Date('2026-09-01')) }, false, new Date('2026-09-15'))
    expect(canExtract(view)).toBe(false)
  })

  it('ignore le plafond en Pro', () => {
    const view = resolveQuota({ used: 200, month: '2026-09' }, true, new Date('2026-09-15'))
    expect(canExtract(view)).toBe(true)
  })
})

describe('contacts', () => {
  it('extrait emails et téléphones FR', () => {
    const text = 'Contact: marie.dupont@acme.fr — 01 23 45 67 89 et logo.png@cdn.net'
    expect(extractEmails(text)).toEqual(['marie.dupont@acme.fr'])
    expect(extractPhones(text).join(' ')).toContain('01 23 45 67 89')
  })
})

describe('groq json', () => {
  it('parse un bloc markdown', () => {
    const payload = parseJsonObject('```json\n{"leads":[{"company_name":"Acme"}]}\n```')
    expect(normalizeLeads(payload, ['company_name', 'email'])).toEqual([
      { company_name: 'Acme', email: '' },
    ])
  })

  it('calibre le contenu sous le budget Groq gratuit', () => {
    const huge = 'contact '.repeat(8_000)
    const max = maxCharsForBudget('system', {
      title: 'Annuaire',
      url: 'https://example.com',
      markdown: huge,
      excerpt: '',
      emails: ['a@b.fr'],
      phones: [],
    })
    const clipped = clipMarkdown(huge, max)
    expect(clipped.length).toBeLessThan(huge.length)
    expect(estimateTokens(`system\n${clipped}`)).toBeLessThan(7_000)
  })
})

describe('extract', () => {
  it('nettoie le DOM et garde les leads visibles', () => {
    const html = `<!doctype html><html><head><title>Annuaire SaaS</title></head>
      <body>
        <nav>Menu tracking</nav>
        <script>window.pixel=1</script>
        <article>
          <h1>Annuaire SaaS B2B</h1>
          <p>Acme Cloud, contact Marie Dupont, marie@acme.fr, 01 23 45 67 89, Directrice commerciale.</p>
        </article>
        <footer>Cookies</footer>
      </body></html>`
    const dom = new JSDOM(html, { url: 'https://annuaire.example/saas' })
    const page = extractPage(dom.window.document)
    expect(page.title).toContain('Annuaire')
    expect(page.markdown.toLowerCase()).toContain('acme')
    expect(page.markdown).not.toContain('window.pixel')
    expect(page.emails).toContain('marie@acme.fr')
  })
})

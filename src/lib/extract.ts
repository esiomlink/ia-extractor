import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { detectBrowserLocale, t } from '../i18n'
import { extractEmails, extractPhones } from './contacts'
import type { PageContent } from './types'

export const MAX_PAGE_CHARS = 40_000
const NOISE_SELECTOR = 'script, style, noscript, iframe, svg, canvas, form, button, nav, footer, header'

function stripNoise(root: ParentNode): void {
  root.querySelectorAll(NOISE_SELECTOR).forEach((node) => node.remove())
}

function collapseText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function fallbackMarkdown(doc: Document): string {
  const source = doc.body ?? doc.documentElement
  const clone = source.cloneNode(true) as HTMLElement
  stripNoise(clone)
  const inner = (clone as unknown as { innerText?: string }).innerText
  const text = inner && inner.trim() ? inner : clone.textContent ?? ''
  return collapseText(text)
}

export function extractPage(doc: Document = document): PageContent {
  const url = doc.location?.href ?? (typeof location !== 'undefined' ? location.href : '')
  let markdown = ''
  let title = doc.title || ''
  let excerpt = ''

  try {
    const clone = doc.cloneNode(true) as Document
    const article = new Readability(clone).parse()
    if (article?.content) {
      const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
      markdown = turndown.turndown(article.content)
      title = article.title || title
      excerpt = article.excerpt || ''
    }
  } catch {
    markdown = ''
  }

  const readabilityMarkdown = collapseText(markdown)
  const fallback = fallbackMarkdown(doc)

  // Readability est conçu pour un article unique. Sur une page de listing
  // (annuaire, annonces, offres d'emploi), il "gagne" parfois un petit bloc
  // hors sujet qui dépasse quand même les 200 caractères — le vrai contenu
  // (les fiches/leads) est alors silencieusement ignoré. On bascule sur le
  // texte complet de la page dès que Readability est nettement plus court
  // que ce que contient réellement la page.
  if (readabilityMarkdown.length < 200 || fallback.length > readabilityMarkdown.length * 1.4) {
    markdown = fallback
    if (!excerpt) excerpt = fallback.slice(0, 220)
  } else {
    markdown = readabilityMarkdown
  }

  markdown = collapseText(markdown).slice(0, MAX_PAGE_CHARS)
  const fullText = `${title}\n${excerpt}\n${doc.body?.innerText ?? ''}`
  const emails = extractEmails(fullText)
  const phones = extractPhones(fullText)

  if (!markdown) {
    throw new Error(t(detectBrowserLocale(), 'error.unreadablePage'))
  }

  return { title, url, markdown, excerpt, emails, phones }
}

export function fallbackExtractFromDom(): PageContent {
  return extractPage(document)
}

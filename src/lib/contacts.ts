const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const PHONE_RE =
  /(?:\+33|0033|0)\s*[1-9](?:[\s.-]?\d{2}){4}|\+\d{1,3}[\s.-]?(?:\d[\s.-]?){6,14}\d/g

const EMAIL_NOISE = /\.(png|jpe?g|gif|webp|svg|css|js)(?:@|$)/i

export function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_RE) ?? []
  const unique = new Set<string>()
  for (const raw of matches) {
    const email = raw.toLowerCase()
    if (EMAIL_NOISE.test(email)) continue
    unique.add(email)
  }
  return [...unique]
}

export function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_RE) ?? []
  const unique = new Set<string>()
  for (const raw of matches) {
    const compact = raw.replace(/[^\d+]/g, '')
    if (compact.replace(/\D/g, '').length < 8) continue
    unique.add(raw.replace(/\s+/g, ' ').trim())
  }
  return [...unique]
}

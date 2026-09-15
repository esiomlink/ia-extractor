export function csvEscape(value: string): string {
  const s = value ?? ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(
  rows: Record<string, string>[],
  fields: string[],
  headers: Record<string, string>,
): string {
  const headerLine = fields.map((field) => csvEscape(headers[field] ?? field)).join(',')
  const body = rows
    .map((row) => fields.map((field) => csvEscape(row[field] ?? '')).join(','))
    .join('\n')
  return `\uFEFF${headerLine}\n${body}\n`
}

export function toTsv(
  rows: Record<string, string>[],
  fields: string[],
  headers: Record<string, string>,
): string {
  const headerLine = fields.map((field) => (headers[field] ?? field).replace(/\t/g, ' ')).join('\t')
  const body = rows
    .map((row) =>
      fields.map((field) => (row[field] ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'),
    )
    .join('\n')
  return `${headerLine}\n${body}`
}

export function defaultCsvFilename(prefix = 'leads'): string {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  return `${prefix}-${stamp}.csv`
}

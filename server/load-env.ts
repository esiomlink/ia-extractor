import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  const envFile = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {
  // .env optionnel
}

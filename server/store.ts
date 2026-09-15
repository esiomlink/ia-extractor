import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStoreMethods, emptyUser, type UserRecord, type UserStore } from './store-core.ts'

type StoreFile = { users: Record<string, UserRecord> }

const dataPath = join(dirname(fileURLToPath(import.meta.url)), 'data', 'users.json')

function readStore(): StoreFile {
  try {
    return JSON.parse(readFileSync(dataPath, 'utf8')) as StoreFile
  } catch {
    return { users: {} }
  }
}

function writeStore(store: StoreFile): void {
  mkdirSync(dirname(dataPath), { recursive: true })
  writeFileSync(dataPath, `${JSON.stringify(store, null, 2)}\n`)
}

export function createFileStore(): UserStore {
  async function getUser(installId: string): Promise<UserRecord> {
    return readStore().users[installId] ?? emptyUser(installId)
  }

  async function saveUser(user: UserRecord): Promise<UserRecord> {
    const store = readStore()
    store.users[user.installId] = user
    writeStore(store)
    return user
  }

  async function clearProBySubscription(subscriptionId: string): Promise<void> {
    const store = readStore()
    for (const user of Object.values(store.users)) {
      if (user.stripeSubscriptionId === subscriptionId) {
        user.isPro = false
        user.stripeSubscriptionId = ''
      }
    }
    writeStore(store)
  }

  return createStoreMethods(getUser, saveUser, clearProBySubscription)
}

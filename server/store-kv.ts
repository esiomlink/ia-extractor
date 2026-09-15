import { createStoreMethods, emptyUser, type UserRecord, type UserStore } from './store-core.ts'

export type KvNamespace = {
  get(key: string, type: 'json'): Promise<unknown>
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export function createKvStore(kv: KvNamespace): UserStore {
  async function getUser(installId: string): Promise<UserRecord> {
    const raw = (await kv.get(`user:${installId}`, 'json')) as UserRecord | null
    return raw ?? emptyUser(installId)
  }

  async function saveUser(user: UserRecord): Promise<UserRecord> {
    await kv.put(`user:${user.installId}`, JSON.stringify(user))
    if (user.stripeSubscriptionId) {
      await kv.put(`sub:${user.stripeSubscriptionId}`, user.installId)
    }
    return user
  }

  async function clearProBySubscription(subscriptionId: string): Promise<void> {
    const installId = await kv.get(`sub:${subscriptionId}`)
    if (!installId) return
    const user = await getUser(installId)
    user.isPro = false
    user.stripeSubscriptionId = ''
    await saveUser(user)
    await kv.delete(`sub:${subscriptionId}`)
  }

  return createStoreMethods(getUser, saveUser, clearProBySubscription)
}

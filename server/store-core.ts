import { canExtract, monthKey, resolveQuota, type QuotaView } from '../src/lib/quota.ts'

export type UserRecord = {
  installId: string
  used: number
  month: string
  isPro: boolean
  licenseKey: string
  stripeCustomerId: string
  stripeSubscriptionId: string
}

export type UserStore = {
  getUser(installId: string): Promise<UserRecord>
  saveUser(user: UserRecord): Promise<UserRecord>
  applyLicense(installId: string, licenseKey: string): Promise<UserRecord>
  setProFromStripe(
    installId: string,
    ids: { customerId?: string; subscriptionId?: string },
  ): Promise<UserRecord>
  clearProBySubscription(subscriptionId: string): Promise<void>
  peekExtract(
    installId: string,
    licenseKey?: string,
  ): Promise<{ ok: true; quota: QuotaView } | { ok: false; quota: QuotaView }>
  consumeExtract(installId: string): Promise<QuotaView>
  userQuota(user: UserRecord): QuotaView
}

export function emptyUser(installId: string): UserRecord {
  return {
    installId,
    used: 0,
    month: '',
    isPro: false,
    licenseKey: '',
    stripeCustomerId: '',
    stripeSubscriptionId: '',
  }
}

export function userQuota(user: UserRecord): QuotaView {
  // Le statut Pro vient uniquement du webhook Stripe (user.isPro) — jamais d'un
  // texte de licence fourni par le client.
  const licensed = user.isPro
  return resolveQuota({ used: user.used, month: user.month }, licensed)
}

export function createStoreMethods(
  getUser: (installId: string) => Promise<UserRecord>,
  saveUser: (user: UserRecord) => Promise<UserRecord>,
  clearProBySubscription: (subscriptionId: string) => Promise<void>,
): UserStore {
  async function applyLicense(installId: string, licenseKey: string): Promise<UserRecord> {
    // Conservé pour compatibilité d'API, mais une clé saisie ici ne débloque plus
    // jamais le Pro : seul le webhook Stripe (setProFromStripe) le fait.
    const user = await getUser(installId)
    user.licenseKey = licenseKey.trim()
    return saveUser(user)
  }

  async function setProFromStripe(
    installId: string,
    ids: { customerId?: string; subscriptionId?: string },
  ): Promise<UserRecord> {
    const user = await getUser(installId)
    user.isPro = true
    if (ids.customerId) user.stripeCustomerId = ids.customerId
    if (ids.subscriptionId) user.stripeSubscriptionId = ids.subscriptionId
    return saveUser(user)
  }

  async function peekExtract(installId: string, licenseKey?: string) {
    const user = await getUser(installId)
    if (licenseKey?.trim() && licenseKey.trim() !== user.licenseKey) {
      user.licenseKey = licenseKey.trim()
      await saveUser(user)
    }
    const quota = userQuota(user)
    if (!canExtract(quota)) return { ok: false as const, quota }
    return { ok: true as const, quota }
  }

  async function consumeExtract(installId: string) {
    const user = await getUser(installId)
    const quota = userQuota(user)
    const next = resolveQuota({ used: quota.used + 1, month: quota.month || monthKey() }, quota.isPro)
    user.used = next.used
    user.month = next.month
    await saveUser(user)
    return next
  }

  return {
    getUser,
    saveUser,
    applyLicense,
    setProFromStripe,
    clearProBySubscription,
    peekExtract,
    consumeExtract,
    userQuota,
  }
}

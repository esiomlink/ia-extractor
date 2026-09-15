export const FREE_MONTHLY_LIMIT = 15

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export type QuotaView = {
  used: number
  month: string
  remaining: number
  limit: number
  isPro: boolean
}

export function resolveQuota(
  state: { used: number; month: string },
  isPro: boolean,
  now = new Date(),
): QuotaView {
  const current = monthKey(now)
  const used = state.month === current ? state.used : 0
  if (isPro) {
    return { used, month: current, remaining: -1, limit: -1, isPro: true }
  }
  return {
    used,
    month: current,
    remaining: Math.max(0, FREE_MONTHLY_LIMIT - used),
    limit: FREE_MONTHLY_LIMIT,
    isPro: false,
  }
}

export function canExtract(quota: QuotaView): boolean {
  return quota.isPro || quota.remaining > 0
}

// Il n'existe plus de schéma de clé de licence local : le statut Pro est
// exclusivement accordé par le webhook Stripe (voir server/app.ts,
// setProFromStripe), qui vérifie la signature Stripe avant de marquer
// l'utilisateur comme Pro. Un ancien validateur ici acceptait n'importe
// quelle chaîne commençant par "B2BPRO-" (ou "B2B-PRO-UNLIMITED") comme
// licence valide : n'importe qui pouvait débloquer le Pro gratuitement en
// la lisant dans le bundle de l'extension. Supprimé pour de bon.

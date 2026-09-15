import { resolveLocale, t, type LocaleSetting } from '../i18n'

export function modelLabel(locale?: LocaleSetting): string {
  return t(resolveLocale(locale), 'model.server')
}

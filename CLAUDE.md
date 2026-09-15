# Extracteur IA — contexte projet pour Claude Code

Extension Chrome + API Node qui extrait des contacts B2B depuis une page web. Le nettoyage de la page se fait dans le navigateur, l'appel LLM (Gemini) se fait côté serveur — le client n'a jamais de clé API. Monétisation freemium : 15 extractions/mois gratuites (comptées côté serveur), puis abonnement Stripe 15€/mois.

## Stack
- Extension : TypeScript, React 19, Vite + @crxjs/vite-plugin, Tailwind CSS 4
- API : Hono (`server/`), déployée sur Cloudflare Workers via `wrangler`
- Tests : Vitest · Lint : oxlint

## Commandes
- `npm run dev` — Vite dev (popup/options)
- `npm run server` — API locale sur http://127.0.0.1:8787
- `npm run build` — build l'extension dans `dist/`
- `npm run demo` — page de test sur :4173 (`demo/annuaire-b2b.html`)
- `npm test` — Vitest, rapide, pas d'appel réseau
- `npm run test:live` — ⚠️ appelle le vrai Gemini, coûte des crédits → ne jamais lancer sans confirmation explicite
- `npm run lint` — oxlint
- `npm run deploy` — `wrangler deploy`, déploie en prod → ne jamais lancer sans confirmation explicite

## Architecture
- `src/` → extension : `popup/`, `options/`, `background/service-worker.ts`, `content/content-script.ts`
- `src/lib/` → cœur métier : `extract.ts` (pipeline), `gemini.ts`/`groq.ts` (LLM), `csv.ts`/`sheets.ts` (export), `quota.ts`, `templates.ts`
- `server/` → API Hono : `app.ts` (routes), `store.ts`/`store-core.ts`/`store-kv.ts` (stockage local vs Cloudflare KV), webhook Stripe
- **i18n : deux systèmes séparés à garder synchronisés**
  - `src/i18n/locales/{de,en,es,fr,it,pt}.ts` — textes de l'UI React
  - `public/_locales/{de,en,es,fr,it,pt_BR,pt_PT}/messages.json` — manifest Chrome (nom/description de l'extension)
  - Note : le manifest a `pt_BR`/`pt_PT` séparés, l'UI React n'a qu'un seul `pt`

## Secrets — ne jamais lire ni afficher
`.env` et `server/.env` contiennent `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Ne jamais les afficher, logger ou committer.

## Conventions
- TypeScript strict, pas de commentaires superflus
- Avant de clore une tâche touchant `src/lib/` ou `server/` : `npm run lint` puis `npm test`
- Licence locale de dev (bypass Stripe) : `B2B-PRO-UNLIMITED`

## Gestion du contexte
- Ne pas lire `node_modules/`, `dist/`, `.wrangler/`, `package-lock.json` sauf débogage précis d'une dépendance
- Chercher avec grep/glob avant de lire un fichier entier
- Pour toute tâche qui touche plusieurs fichiers de locale, ou qui lance tests/lint : déléguer aux sub-agents `i18n-translator` / `test-runner` (`.claude/agents/`) plutôt que de tout charger dans la conversation principale

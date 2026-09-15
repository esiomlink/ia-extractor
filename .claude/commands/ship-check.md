---
description: Checklist avant déploiement (wrangler deploy)
---
Avant tout déploiement :
1. `npm run lint` et `npm test` passent
2. `npm run build` réussit sans erreur
3. Vérifie qu'aucun secret (GEMINI_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) n'est en dur dans le code — signale juste l'emplacement si tu en trouves, jamais la valeur
4. Rappelle que `npm run deploy` et `wrangler secret put` doivent être lancés manuellement — ne les exécute pas sans confirmation explicite

Réponds avec un résumé court (✅/❌ par point).

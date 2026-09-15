# Extracteur IA

Extension Chrome + API Node : la page est nettoyée dans le navigateur, **Gemini tourne sur ton serveur**. Le client n’a aucune clé à coller.

## Lancer en local

```bash
npm install
npm run server          # API http://127.0.0.1:8787
npm run build           # extension → dist/
npm run demo            # page de test
```

1. Chrome → `chrome://extensions` → charger `dist/`
2. Ouvrir `http://127.0.0.1:4173/annuaire-b2b.html`
3. Extraire : le popup parle au serveur, le serveur appelle Gemini

## Vendre (15 € / mois)

Gratuit : 15 extractions / mois (compté **côté serveur**).  
Pro : bouton « Payer 15 € / mois » → Stripe Checkout.

Dans `server/.env` :

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...          # abonnement 15 € / mois
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_URL=https://api.tondomaine.com
```

Webhook Stripe : `POST https://api.tondomaine.com/v1/stripe-webhook`  
Événements : `checkout.session.completed`, `customer.subscription.deleted`.

En attendant Stripe, licence locale : `B2B-PRO-UNLIMITED`.

Déploie l’API sur **Cloudflare Workers** (gratuit) :

```bash
npx wrangler login
npx wrangler kv namespace create USERS
# colle l’id dans wrangler.jsonc → kv_namespaces
npx wrangler secret put GEMINI_API_KEY
npm run deploy
```

Mets `VITE_API_URL=https://ia-extractor.extracteur-ia.workers.dev` avant `npm run build`, puis publie l’extension **sans** clé Gemini dans le zip.

En local, Stripe n’est pas obligatoire : Options → licence `B2B-PRO-UNLIMITED`.

---
description: Ajoute ou met à jour une chaîne de traduction dans les systèmes i18n
argument-hint: <clé> "<texte français>"
---
Ajoute la clé $1 avec le texte source $2 dans :
1. `src/i18n/locales/*.ts` (de, en, es, fr, it, pt) — traduis dans chaque langue
2. `public/_locales/*/messages.json` (de, en, es, fr, it, pt_BR, pt_PT) si la clé concerne le manifest de l'extension (nom/description) ; sinon ignore cette étape

Garde le ton et la structure existants de chaque fichier. Ne touche à aucune autre clé.

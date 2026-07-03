# JobPilot — Suivi de candidatures

Application locale pour piloter une recherche d'emploi : suivi des candidatures (LinkedIn, HelloWork, Indeed…), relances à ne pas rater, et analyse de CV par IA face à une offre précise.

## Démarrage

```bash
pnpm install
pnpm dev        # lance l'API SQLite (127.0.0.1:3001) + le front (http://localhost:5173)
pnpm build      # type-check + build de production dans dist/
```

Prérequis : Node 22+, pnpm 9+.

## Fonctionnalités

### Tableau de bord (`/`)
- Compteurs : candidatures envoyées, entretiens, offres, refus, taux d'entretien.
- **Relances à faire** : toute candidature dont la date de « prochaine action » est atteinte ou dépassée remonte ici automatiquement (sauf si refusée ou offre reçue).

### Candidatures (`/candidatures`)
- Vue **tableau** (tri visuel, liens vers les offres) et vue **kanban** (glisser-déposer une carte pour changer son statut).
- Statuts : À postuler → Postulée → Relancée → Entretien → Offre / Refusée.
- Chaque changement de statut est enregistré dans l'historique de la candidature.
- Recherche par entreprise, poste ou lieu.

### Amélioration CV (`/cv`)
Un « recruteur senior » (IA) note ton CV sur 100 face à une fiche de poste : points forts/faibles, reformulations prêtes à copier, mots-clés ATS manquants, verdict.

Deux modes :
1. **Sans API (gratuit)** : « Copier le prompt » → coller dans Claude / ChatGPT / Mistral (abonnement chat) → « Coller le résultat » pour l'archiver. La note /100 est extraite automatiquement.
2. **API Mistral** : renseigner une clé (gratuite sur [console.mistral.ai](https://console.mistral.ai)) → bouton « Analyser avec Mistral » en un clic.

Le CV collé est mémorisé sur l'appareil pour les analyses suivantes.

### Exports (barre latérale)
- **Excel (.xlsx)** : onglet « Candidatures », dates Excel réelles, pour consulter/partager.
- **JSON** : sauvegarde complète (avec historique), ré-importable via « Importer ».

## Où sont mes données ?

Dans une base **SQLite locale** : `%LOCALAPPDATA%\JobPilot\jobpilot.db` (Windows), servie par un petit serveur Node (`server/index.mjs`) qui n'écoute que sur `127.0.0.1` — inaccessible depuis le réseau.

- Les données **survivent au nettoyage du navigateur** et sont indépendantes du navigateur utilisé.
- Sauvegarde = copier ce fichier `.db` (ou export JSON depuis la sidebar).
- Au premier lancement, les anciennes données localStorage sont **migrées automatiquement** vers SQLite.
- La clé API Mistral est stockée dans cette base, n'est **jamais incluse dans les exports**, et n'est envoyée qu'à `api.mistral.ai` en HTTPS.
- Honnêteté sur le modèle de menace : un fichier local reste lisible par un malware ayant accès au disque — la vraie protection, c'est le chiffrement du disque (BitLocker) et un poste sain.

## Architecture

```
server/
└── index.mjs             # API Express + SQLite (better-sqlite3), 127.0.0.1:3001
src/
├── main.tsx              # Bootstrap + routes TanStack Router (/, /candidatures, /cv)
├── types.ts              # Modèle Application, statuts, libellés/couleurs
├── api.ts                # Client HTTP vers le serveur local (écritures optimistes)
├── storage.ts            # Persistance candidatures + exports Excel/JSON
├── cv.ts                 # Module CV : réglages, analyses, prompt recruteur, appel Mistral
├── components/
│   ├── Layout.tsx        # Sidebar + navigation + boutons export/import
│   ├── ApplicationForm.tsx  # Modal création/édition
│   └── StatusBadge.tsx
└── pages/
    ├── Dashboard.tsx
    ├── Applications.tsx  # Vues tableau + kanban
    └── CvPage.tsx
```

Stack : Vite · React 19 · TypeScript · TanStack Router · Tailwind CSS v4 · pnpm.

**Principe clé** : toute la persistance passe par `storage.ts` et `cv.ts` (hooks `useApplications`, `useSettings`, `useAnalyses` basés sur `useSyncExternalStore`, cache mémoire + écritures optimistes vers l'API). L'UI ne parle jamais au serveur directement — pour passer en SaaS, il suffira de pointer `api.ts` vers un serveur distant avec authentification.

## Branches git

- `main` : version stable.
- `development` : branche de travail — développer ici, fusionner dans `main` quand c'est stable.

## Roadmap

- [ ] Stats par source (taux de réponse LinkedIn vs HelloWork vs Indeed)
- [ ] Tri des colonnes du tableau
- [ ] Gestion utilisateurs + backend (version SaaS) — **la clé API devra alors passer côté serveur**

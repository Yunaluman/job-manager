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
- **Par plateforme** : candidatures envoyées, entretiens, taux de réponse et taux d'entretien par source (LinkedIn, HelloWork…) — pour savoir où investir son temps.

### Candidatures (`/candidatures`)
- Vue **tableau** (tri visuel, liens vers les offres) et vue **kanban** (glisser-déposer une carte pour changer son statut).
- **Ajout express** : coller le texte d'une offre → entreprise, poste, lieu, salaire et source extraits automatiquement (IA si clé configurée, heuristique locale sinon), formulaire pré-rempli à valider.
- Relance proposée par défaut à J+7 ; passage en « Relancée » = prochaine relance replanifiée automatiquement.
- Statuts : À postuler → Postulée → Relancée → Entretien → Offre / Refusée.
- Chaque changement de statut est enregistré dans l'historique de la candidature.
- **Fiche détail** (clic sur une ligne) : toutes les infos, changement de statut rapide, et timeline de l'historique.
- Recherche par entreprise, poste ou lieu ; tri par colonne (3e clic = ordre par défaut).

### Amélioration CV (`/cv`)
Un « recruteur senior » (IA) note ton CV sur 100 face à une fiche de poste : points forts/faibles, reformulations prêtes à copier, mots-clés ATS manquants, verdict.

Le CV se dépose en fichier (PDF/DOCX/TXT, extraction du texte 100% locale) ou se colle en texte ; il est mémorisé pour les analyses suivantes. L'analyse inclut un score **Compatibilité ATS /100** : couverture des mots-clés de l'offre, mots-clés critiques absents et où les insérer.

Deux modes :
1. **Sans API (gratuit)** : « Copier le prompt » → coller dans Claude / ChatGPT / Mistral (abonnement chat) → « Coller le résultat » pour l'archiver. La note /100 est extraite automatiquement.
2. **API directe** : fournisseur configurable (presets Mistral et Z.ai/GLM, ou toute API au format OpenAI via URL personnalisée) → analyse en un clic.

### Lettre de motivation (`/lettre`)
Lettre complète prête à envoyer : en-tête avec les coordonnées du profil, date, objet, puis un corps de 280-380 mots appuyé uniquement sur le CV mémorisé (rien d'inventé). Le style imite les vraies lettres de l'utilisateur (ton personnel et sincère, parcours atypique assumé, projection dans l'évolution) plutôt qu'une lettre type robotique. Champ « points à mettre en avant » optionnel. Deux modes (prompt à copier ou génération API), lettres archivées avec bouton « Copier la lettre ».

### Mon profil (`/profil`)
- **Identité** : nom, poste recherché, email, téléphone, ville — utilisé pour l'en-tête des lettres.
- **CV** : dépôt de fichier (PDF/DOCX/TXT) ou texte collé, partagé par les modules CV et Lettre.

### Paramètres (`/parametres`)
- **Fournisseur IA** : dropdown Mistral / Z.ai, modèle éditable, une clé par fournisseur (le dropdown fait suivre la bonne clé).
- **Mes données** : export Excel (.xlsx, dates réelles, pour consulter/partager), export JSON (sauvegarde complète ré-importable), import JSON.

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
├── cv.ts                 # Module CV : réglages, analyses, prompt recruteur+ATS, appel IA
├── parse.ts              # Ajout express : extraction d'offre (IA ou heuristique)
├── extract.ts            # Extraction texte des fichiers CV (PDF/DOCX/TXT, local)
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

## Dépannage

**`pnpm dev` échoue / s'arrête tout seul** : dans 99% des cas, une instance précédente tourne encore et occupe le port 3001 ou 5173 (sous Windows, fermer le terminal ne tue pas toujours les processus enfants). Le serveur affiche maintenant un message clair avec la commande de nettoyage :

```powershell
Get-NetTCPConnection -LocalPort 3001,5173 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
```

## Branches git

- `main` : version stable.
- `development` : branche de travail — développer ici, fusionner dans `main` quand c'est stable.

## Roadmap

- [ ] Gestion utilisateurs + backend (version SaaS) — **la clé API devra alors passer côté serveur**

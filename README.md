# JobPilot — Job application tracker

**English** · [Français](README.fr.md)

A local app to run a job search: track applications (LinkedIn, HelloWork, Indeed…), never miss a follow-up, and get an AI analysis of your CV against a specific job offer.

## Getting started

```bash
pnpm install
pnpm dev        # starts the SQLite API (127.0.0.1:3001) + the front end (http://localhost:5173)
pnpm build      # type-check + production build into dist/
```

Requirements: Node 22+, pnpm 9+.

## Features

### Dashboard (`/`)
- Counters: applications sent, interviews, offers, rejections, interview rate.
- **Follow-ups due**: any application whose "next action" date is reached or past shows up here automatically (unless rejected or an offer was received).
- **By platform**: applications sent, interviews, response rate and interview rate per source (LinkedIn, HelloWork…) — so you know where to spend your time.

### Applications (`/candidatures`)
- **Table** view (visual sorting, links to offers) and **kanban** view (drag a card to change its status).
- **Quick add**: paste a job posting → company, position, location, salary and source are extracted automatically (AI if a key is configured, local heuristics otherwise), with a pre-filled form to confirm.
- Follow-up suggested at D+7 by default; moving to "Followed up" automatically schedules the next follow-up.
- Statuses: To apply → Applied → Followed up → Interview → Offer / Rejected.
- Every status change is recorded in the application's history.
- **Detail sheet** (click a row): all the info, quick status change, and a history timeline.
- Search by company, position or location; sort by column (3rd click = default order).

### CV improvement (`/cv`)
A "senior recruiter" (AI) scores your CV out of 100 against a job description: strengths/weaknesses, ready-to-copy rewordings, missing ATS keywords, verdict.

Upload the CV as a file (PDF/DOCX/TXT, text extraction is 100% local) or paste it as text; it is remembered for later analyses. The analysis includes an **ATS compatibility score /100**: coverage of the offer's keywords, missing critical keywords and where to insert them.

Two modes:
1. **No API (free)**: "Copy prompt" → paste into Claude / ChatGPT / Mistral (chat subscription) → "Paste result" to archive it. The /100 score is extracted automatically.
2. **Direct API**: configurable provider (Mistral and Z.ai/GLM presets, or any OpenAI-compatible API via a custom URL) → one-click analysis.

### Cover letter (`/lettre`)
A letter targeted at the offer, based only on the stored CV (nothing invented), 250–350 words without empty phrases. Optional "points to highlight" field. Same two modes as the CV module (prompt to copy or API generation); letters are archived with a "Copy letter" button.

### Exports (sidebar)
- **Excel (.xlsx)**: "Applications" sheet with real Excel dates, to browse or share.
- **JSON**: full backup (including history), re-importable via "Import".

## Where is my data?

In a **local SQLite database**: `%LOCALAPPDATA%\JobPilot\jobpilot.db` (Windows), served by a small Node server (`server/index.mjs`) that only listens on `127.0.0.1` — unreachable from the network.

- Data **survives clearing the browser** and does not depend on which browser you use.
- Backup = copy that `.db` file (or JSON export from the sidebar).
- On first launch, older localStorage data is **migrated automatically** to SQLite.
- The Mistral API key is stored in this database, is **never included in exports**, and is only sent to `api.mistral.ai` over HTTPS.
- Honest threat model: a local file can still be read by malware with disk access — the real protection is disk encryption (BitLocker) and a healthy machine.

## Architecture

```
server/
└── index.mjs             # Express + SQLite API (better-sqlite3), 127.0.0.1:3001
src/
├── main.tsx              # Bootstrap + TanStack Router routes (/, /candidatures, /cv)
├── types.ts              # Application model, statuses, labels/colors
├── api.ts                # HTTP client for the local server (optimistic writes)
├── storage.ts            # Application persistence + Excel/JSON exports
├── cv.ts                 # CV module: settings, analyses, recruiter+ATS prompt, AI call
├── parse.ts              # Quick add: offer extraction (AI or heuristics)
├── extract.ts            # Text extraction from CV files (PDF/DOCX/TXT, local)
├── components/
│   ├── Layout.tsx        # Sidebar + navigation + export/import buttons
│   ├── ApplicationForm.tsx  # Create/edit modal
│   └── StatusBadge.tsx
└── pages/
    ├── Dashboard.tsx
    ├── Applications.tsx  # Table + kanban views
    └── CvPage.tsx
```

Stack: Vite · React 19 · TypeScript · TanStack Router · Tailwind CSS v4 · pnpm.

**Key principle**: all persistence goes through `storage.ts` and `cv.ts` (`useApplications`, `useSettings`, `useAnalyses` hooks built on `useSyncExternalStore`, in-memory cache + optimistic writes to the API). The UI never talks to the server directly — going SaaS only requires pointing `api.ts` at a remote server with authentication.

## Git branches

- `main`: stable version.
- `development`: working branch — develop here, merge into `main` once stable.

## Roadmap

- [ ] User management + backend (SaaS version) — **the API key will then have to move server-side**

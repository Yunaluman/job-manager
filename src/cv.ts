// Module Amélioration CV — réglages, analyses, prompt recruteur, appel Mistral.
// SÉCURITÉ : la clé API vit dans sa propre entrée localStorage (jamais dans
// l'export JSON des candidatures), n'est jamais loggée, et n'est envoyée
// qu'à https://api.mistral.ai. Pour une future version SaaS, elle devra
// impérativement être déplacée côté serveur.
import { useSyncExternalStore } from 'react'

const SETTINGS_KEY = 'jobpilot.settings.v1'
const ANALYSES_KEY = 'jobpilot.cv-analyses.v1'

export interface Settings {
  mistralKey: string
  cvText: string
}

export interface CvAnalysis {
  id: string
  date: string
  jobTitle: string // première ligne de l'offre, pour la liste
  result: string
  score: number | null
  mode: 'api' | 'manuel'
}

let settingsCache: Settings | null = null
let analysesCache: CvAnalysis[] | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function loadSettings(): Settings {
  if (!settingsCache) {
    try {
      settingsCache = { mistralKey: '', cvText: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
    } catch {
      settingsCache = { mistralKey: '', cvText: '' }
    }
  }
  return settingsCache!
}

function loadAnalyses(): CvAnalysis[] {
  if (!analysesCache) {
    try {
      analysesCache = JSON.parse(localStorage.getItem(ANALYSES_KEY) ?? '[]')
    } catch {
      analysesCache = []
    }
  }
  return analysesCache!
}

export const useSettings = () => useSyncExternalStore(subscribe, loadSettings)
export const useAnalyses = () => useSyncExternalStore(subscribe, loadAnalyses)

export function saveSettings(patch: Partial<Settings>) {
  settingsCache = { ...loadSettings(), ...patch }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache))
  notify()
}

export function addAnalysis(a: Omit<CvAnalysis, 'id' | 'date'>): CvAnalysis {
  const full: CvAnalysis = { ...a, id: crypto.randomUUID(), date: new Date().toISOString() }
  analysesCache = [full, ...loadAnalyses()]
  localStorage.setItem(ANALYSES_KEY, JSON.stringify(analysesCache))
  notify()
  return full
}

export function deleteAnalysis(id: string) {
  analysesCache = loadAnalyses().filter((a) => a.id !== id)
  localStorage.setItem(ANALYSES_KEY, JSON.stringify(analysesCache))
  notify()
}

export function extractScore(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*\/\s*100/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 0 && n <= 100 ? n : null
}

export function buildPrompt(cv: string, offer: string): string {
  return `Tu es un recruteur senior avec 15 ans d'expérience. Analyse le CV ci-dessous par rapport à la fiche de poste fournie, avec l'œil critique et honnête d'un recruteur qui trie des centaines de candidatures.

Réponds en français, structuré exactement ainsi :

## Note globale : X/100
(adéquation réelle du CV avec CETTE offre précise)

## Points forts (par rapport à l'offre)
- ...

## Points faibles / manques
- ...

## Améliorations concrètes
Pour chaque point : ce qu'il faut changer, et un exemple de reformulation prêt à copier.

## Mots-clés de l'offre absents du CV
(importants pour les filtres ATS)

## Verdict du recruteur
2-3 phrases : ce CV passerait-il ton tri ? Pourquoi ?

--- FICHE DE POSTE ---
${offer}

--- CV DU CANDIDAT ---
${cv}`
}

export async function analyzeWithMistral(cv: string, offer: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [{ role: 'user', content: buildPrompt(cv, offer) }],
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API invalide ou expirée.')
    if (res.status === 429) throw new Error('Limite de débit atteinte (palier gratuit) — réessaie dans une minute.')
    throw new Error(`Erreur Mistral (${res.status}).`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Réponse inattendue de l’API.')
  return content
}

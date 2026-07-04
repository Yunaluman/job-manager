// Module Amélioration CV — réglages, analyses, prompt recruteur, appel Mistral.
// Persistance : serveur local SQLite (via api.ts), plus rien dans localStorage.
// SÉCURITÉ : la clé API n'est jamais loggée, jamais incluse dans les exports,
// et n'est envoyée qu'à https://api.mistral.ai. Pour une future version SaaS,
// elle devra impérativement être déplacée côté serveur.
import { useSyncExternalStore } from 'react'
import { apiGet, apiSend } from './api'

const LEGACY_SETTINGS = 'jobpilot.settings.v1'
const LEGACY_ANALYSES = 'jobpilot.cv-analyses.v1'

export interface Settings {
  apiKey: string
  baseUrl: string
  model: string
  cvText: string
}

// Les deux fournisseurs exposent une API au format OpenAI (chat/completions) :
// en changer revient à changer l'URL de base et le nom du modèle.
export const PROVIDER_PRESETS = [
  {
    id: 'mistral',
    label: 'Mistral (UE, RGPD)',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    keyHint: 'Clé gratuite sur console.mistral.ai',
  },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    model: 'glm-4.6',
    keyHint: 'Clé sur z.ai — modèle gratuit dispo : glm-4.5-flash',
  },
] as const

export interface CvAnalysis {
  id: string
  date: string
  jobTitle: string // première ligne de l'offre, pour la liste
  result: string
  score: number | null
  mode: 'api' | 'manuel'
  kind?: 'cv' | 'lettre' // absent = 'cv' (données antérieures)
}

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  model: PROVIDER_PRESETS[0].model,
  cvText: '',
}
let settingsCache: Settings = DEFAULT_SETTINGS
let analysesCache: CvAnalysis[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

// Chargement initial + migration unique depuis l'ancien localStorage
async function init() {
  try {
    const [settings, analyses] = await Promise.all([
      apiGet<Partial<Settings>>('settings'),
      apiGet<CvAnalysis[]>('analyses'),
    ])
    const legacySettings = localStorage.getItem(LEGACY_SETTINGS)
    if (!settings.cvText && !settings.apiKey && legacySettings) {
      Object.assign(settings, JSON.parse(legacySettings))
      apiSend('PUT', 'settings', settings)
      localStorage.removeItem(LEGACY_SETTINGS)
    }
    // Migration de l'ancien réglage mono-fournisseur (mistralKey) vers le format générique
    const old = settings as Partial<Settings> & { mistralKey?: string }
    if (old.mistralKey && !settings.apiKey) {
      settings.apiKey = old.mistralKey
      apiSend('PUT', 'settings', { apiKey: old.mistralKey, mistralKey: '' })
    }
    const legacyAnalyses = localStorage.getItem(LEGACY_ANALYSES)
    let allAnalyses = analyses
    if (analyses.length === 0 && legacyAnalyses) {
      allAnalyses = JSON.parse(legacyAnalyses)
      if (allAnalyses.length > 0) apiSend('PUT', 'analyses', allAnalyses)
      localStorage.removeItem(LEGACY_ANALYSES)
    }
    settingsCache = {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v)),
    }
    analysesCache = allAnalyses.sort((a, b) => b.date.localeCompare(a.date))
    notify()
  } catch {
    setTimeout(init, 1500)
  }
}
void init()

export const useSettings = () => useSyncExternalStore(subscribe, () => settingsCache)
export const useAnalyses = () => useSyncExternalStore(subscribe, () => analysesCache)

export function saveSettings(patch: Partial<Settings>) {
  settingsCache = { ...settingsCache, ...patch }
  notify()
  apiSend('PUT', 'settings', patch)
}

export function addAnalysis(a: Omit<CvAnalysis, 'id' | 'date'>): CvAnalysis {
  const full: CvAnalysis = { ...a, id: crypto.randomUUID(), date: new Date().toISOString() }
  analysesCache = [full, ...analysesCache]
  notify()
  apiSend('PUT', `analyses/${full.id}`, full)
  return full
}

export function deleteAnalysis(id: string) {
  analysesCache = analysesCache.filter((a) => a.id !== id)
  notify()
  apiSend('DELETE', `analyses/${id}`)
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

## Compatibilité ATS : X/100
Les logiciels de tri (ATS) filtrent avant tout humain. Évalue :
- Taux de couverture des mots-clés de l'offre : X% (mots-clés trouvés / attendus)
- Mots-clés critiques PRÉSENTS dans le CV : liste
- Mots-clés critiques ABSENTS (à intégrer en priorité) : liste, avec pour chacun où et comment l'insérer naturellement
- Pièges de format qui gênent le parsing ATS repérés dans le texte (titres non standards, intitulés flous…)

## Points forts (par rapport à l'offre)
- ...

## Points faibles / manques
- ...

## Améliorations concrètes
Pour chaque point : ce qu'il faut changer, et un exemple de reformulation prêt à copier,
en intégrant les mots-clés ATS manquants là où c'est pertinent.

## Verdict du recruteur
2-3 phrases : ce CV passerait-il d'abord le filtre ATS, puis ton tri humain ? Pourquoi ?

--- FICHE DE POSTE ---
${offer}

--- CV DU CANDIDAT ---
${cv}`
}

export function buildLetterPrompt(cv: string, offer: string, points: string): string {
  return `Tu es un candidat qui écrit une lettre de motivation en français pour l'offre ci-dessous, en t'appuyant uniquement sur les éléments réels du CV fourni (n'invente aucune expérience).

Exigences :
- 250 à 350 mots, ton professionnel mais naturel et direct — bannis les formules creuses (« votre entreprise renommée », « je suis motivé »)
- Structure : accroche spécifique à l'entreprise/au poste → 2 paragraphes reliant les expériences du CV aux besoins concrets de l'offre (avec les mots-clés de l'offre) → conclusion avec proposition d'échange
- Prête à envoyer : uniquement le texte de la lettre, sans commentaire autour
${points.trim() ? `- Mets particulièrement en avant : ${points.trim()}` : ''}

--- FICHE DE POSTE ---
${offer}

--- CV DU CANDIDAT ---
${cv}`
}

export async function callApi(prompt: string, s: Settings): Promise<string> {
  const res = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API invalide ou expirée.')
    if (res.status === 404) throw new Error(`Modèle « ${s.model} » introuvable chez ce fournisseur.`)
    if (res.status === 429) throw new Error('Limite de débit atteinte — réessaie dans une minute.')
    throw new Error(`Erreur API (${res.status}).`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Réponse inattendue de l’API.')
  return content
}

export const analyzeWithApi = (cv: string, offer: string, s: Settings) =>
  callApi(buildPrompt(cv, offer), s)

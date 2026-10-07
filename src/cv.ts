// Provider credentials stay on the local server; the UI receives presence flags only.
import { dataStore, useData, usePersistenceStatus, useInitializationError } from './data'
import { apiRequest } from './api'


export interface Settings {
  keyStatus: Record<string, boolean>
  baseUrl: string
  model: string
  cvText: string
  // Profil — utilisé pour l'en-tête des lettres de motivation
  profileName: string
  profileEmail: string
  profilePhone: string
  profileCity: string
  profileTitle: string // poste recherché, ex "Développeur backend / data"
}

// Les deux fournisseurs exposent une API au format OpenAI (chat/completions) :
// en changer revient à changer l'URL de base et le nom du modèle.
export const PROVIDER_PRESETS = [
  {
    id: 'mistral',
    label: 'Mistral',
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

// Économie de tokens : plafonds sur ce qu'on envoie (≈ 4 caractères / token).
// Un CV tient largement en 9000 caractères ; au-delà c'est du bruit d'extraction.
const MAX_CV_CHARS = 9000
const MAX_OFFER_CHARS = 6000
export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[…texte tronqué…]` : text
}

export function providerId(s: Settings): string {
  return PROVIDER_PRESETS.find((p) => p.baseUrl === s.baseUrl)?.id ?? 'custom'
}

export function hasApiKey(s: Settings): boolean {
  return s.keyStatus?.[providerId(s)] === true
}
export const useSettings = () => useData().settings
export const useAnalyses = () => useData().analyses
export function useSettingsError() {
  const status = usePersistenceStatus()
  const initializationError = useInitializationError()
  return initializationError || status.error
}

export async function saveSettings(patch: Partial<Settings>) {
  return dataStore.mutate<Settings>(() => ({ method: 'PUT', path: 'settings', body: patch,
    apply: (state, settings) => ({ ...state, settings: { ...state.settings, ...settings } }) }))
}

export async function saveCredential(provider: string, key?: string) {
  return dataStore.mutate<Settings>(() => ({ method: key === undefined ? 'DELETE' : 'PUT', path: `credentials/${provider}`,
    body: key === undefined ? undefined : { key },
    apply: (state, settings) => ({ ...state, settings: { ...state.settings, ...settings } }) }))
}

export async function addAnalysis(a: Omit<CvAnalysis, 'id' | 'date'>): Promise<CvAnalysis> {
  const full: CvAnalysis = { ...a, id: crypto.randomUUID(), date: new Date().toISOString() }
  return dataStore.mutate<CvAnalysis>(() => ({ method: 'PUT', path: `analyses/${full.id}`, body: full,
    apply: (state, saved) => ({ ...state, analyses: [saved, ...state.analyses] }) }))
}

export async function deleteAnalysis(id: string) {
  await dataStore.mutate<{ id: string }>(() => ({ method: 'DELETE', path: `analyses/${id}`,
    apply: (state, saved) => {
      if (saved.id !== id) throw new Error('Confirmation de suppression invalide.')
      return { ...state, analyses: state.analyses.filter((analysis) => analysis.id !== id) }
    } }))
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
${clip(offer, MAX_OFFER_CHARS)}

--- CV DU CANDIDAT ---
${clip(cv, MAX_CV_CHARS)}`
}

export function buildLetterPrompt(s: Settings, offer: string, points: string): string {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const contact = [s.profileName, s.profilePhone && `Tél : ${s.profilePhone}`, s.profileEmail && `Mail : ${s.profileEmail}`, s.profileCity]
    .filter(Boolean)
    .join('\n')

  return `Tu écris une lettre de motivation en français, à la première personne, pour l'offre ci-dessous. Tu t'appuies uniquement sur les éléments réels du CV fourni — n'invente aucune expérience.

STYLE (important — imite ce ton, pas celui d'une lettre type) :
Le candidat écrit des lettres personnelles et sincères, jamais robotiques. Voici un extrait d'une de ses vraies lettres, à prendre comme référence de ton :
« Passionné par le développement et les nouvelles technologies, mon parcours est volontairement jonché de curiosité : backend, data, automation… cela reflète ma capacité d'adaptation et mon envie de comprendre les projets dans leur globalité. Aujourd'hui, je m'oriente résolument vers un rôle backend/data, tout en appréciant de rester connecté au front pour garder une vision produit. »
Caractéristiques à reproduire : enthousiasme sincère et précis (jamais « votre entreprise renommée »), parcours atypique assumé comme une force, envie d'apprendre et de progresser affirmée, projection concrète dans ce que le candidat apportera ET ce que l'entreprise lui permettra de devenir.

STRUCTURE :
${contact ? `- En-tête avec les coordonnées :\n${contact}\n- Ligne « À l'attention du Responsable de recrutement », puis « Le ${today}${s.profileCity ? ` à ${s.profileCity.replace(/^\d{5}\s*/, '')}` : ''} »\n- Ligne « Objet : Candidature pour le poste de [intitulé exact de l'offre] »` : `- Commence directement par « Objet : Candidature pour le poste de [intitulé exact de l'offre] »`}
- « Madame, Monsieur, »
- Accroche : pourquoi CETTE entreprise précisément (reprends des éléments concrets de l'offre : secteur, projets, envergure)
- 2 paragraphes reliant les expériences réelles du CV aux besoins de l'offre, avec ses mots-clés
- Un paragraphe projection : ce que le candidat veut apprendre/devenir dans ce poste
- Conclusion courte avec proposition d'échange, « Cordialement, » et le nom
- 280 à 380 mots pour le corps, prête à envoyer, uniquement la lettre sans commentaire autour
${points.trim() ? `- Mets particulièrement en avant : ${points.trim()}` : ''}

--- FICHE DE POSTE ---
${clip(offer, MAX_OFFER_CHARS)}

--- CV DU CANDIDAT ---
${clip(s.cvText, MAX_CV_CHARS)}`
}

export async function callApi(prompt: string, s: Settings, maxTokens = 1600, temperature = 0.3): Promise<string> {
  const data = await apiRequest<{ content: string }>('POST', 'ai', { prompt, baseUrl: s.baseUrl, model: s.model, maxTokens, temperature })
  return data.content
}

export const analyzeWithApi = (cv: string, offer: string, s: Settings) =>
  callApi(buildPrompt(cv, offer), s)

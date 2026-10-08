// Ajout express : extraction des champs d'une offre d'emploi collée.
// Deux stratégies : IA (fournisseur configuré dans le module CV) avec repli
// automatique sur une heuristique locale si pas de clé ou en cas d'erreur.
import { hasApiKey, callApi, type Settings } from './cv'

export interface ParsedOffer {
  company?: string
  title?: string
  location?: string
  salary?: string
  source?: string
  url?: string
}

export function sourceFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).host
    if (host.includes('linkedin')) return 'LinkedIn'
    if (host.includes('hellowork')) return 'HelloWork'
    if (host.includes('indeed')) return 'Indeed'
    if (host.includes('welcometothejungle')) return 'Welcome to the Jungle'
    if (host.includes('apec')) return 'APEC'
    if (host.includes('francetravail') || host.includes('pole-emploi')) return 'France Travail'
    return host.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

export function parseOfferHeuristic(text: string): ParsedOffer {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: ParsedOffer = {}

  // Titre : première ligne (nettoyée des mentions H/F etc. en fin)
  out.title = lines[0]?.replace(/\s*[-–(]?\s*[HF]\s*\/\s*[FH]\s*[)]?\s*$/i, '').slice(0, 100)

  // Entreprise : libellé explicite, sinon « chez X », sinon 2e ligne courte
  const companyLabel = text.match(/(?:entreprise|société|employeur)\s*:\s*(.{2,60})/i)
  const chez = text.match(/chez\s+([A-ZÀ-Ü][\w&'’.-]+(?:\s+[A-ZÀ-Ü&][\w&'’.-]+){0,3})/)
  out.company =
    companyLabel?.[1].trim() ??
    chez?.[1].trim() ??
    (lines[1] && lines[1].length <= 40 && !/[.!?]$/.test(lines[1]) ? lines[1] : undefined)

  // Lieu : libellé explicite, sinon « Ville (75) » / code postal
  const locLabel = text.match(/(?:lieu|localisation|ville|localité)\s*:\s*(.{2,60})/i)
  const postal = text.match(/([A-ZÀ-Ü][\wà-ü'-]+(?:[\s-][A-ZÀ-Ü][\wà-ü'-]+)*)\s*[-(]\s*\d{2,5}\s*\)?/)
  out.location = locLabel?.[1].trim() ?? postal?.[0].trim()

  // Salaire : montants avec €/k, fourchettes
  const salary = text.match(
    /(\d[\d\s.,]{0,8}\s*(?:k€|K€|k euros?|€)(?:\s*[-–à]+\s*\d[\d\s.,]{0,8}\s*(?:k€|K€|k euros?|€))?(?:\s*(?:brut|net|par an|\/an|annuel|par mois|\/mois))?)/,
  )
  out.salary = salary?.[1].replace(/\s+/g, ' ').trim()

  return out
}

export async function parseOfferWithApi(text: string, s: Settings): Promise<ParsedOffer> {
  const raw = await callApi(`Extrais de cette offre d'emploi un JSON strict (sans markdown, sans commentaire) avec exactement ces clés : company (nom de l'entreprise), title (intitulé du poste, sans "H/F"), location (ville), salary (tel qu'écrit, sinon null), source (site d'origine si identifiable, sinon null). Valeurs en français, null si introuvable.

OFFRE :
${text.slice(0, 6000)}`, s, 'offer-extraction', 300, 0)
  const json = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!json) throw new Error('Pas de JSON dans la réponse')
  const parsed = JSON.parse(json)
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() && v !== 'null' ? v.trim() : undefined)
  return {
    company: clean(parsed.company),
    title: clean(parsed.title),
    location: clean(parsed.location),
    salary: clean(parsed.salary),
    source: clean(parsed.source),
  }
}

// Point d'entrée : IA si clé configurée, repli heuristique sinon / en cas d'échec
export async function parseOffer(text: string, url: string, settings: Settings): Promise<ParsedOffer> {
  let parsed: ParsedOffer
  if (hasApiKey(settings)) {
    try {
      parsed = await parseOfferWithApi(text, settings)
    } catch {
      parsed = parseOfferHeuristic(text)
    }
  } else {
    parsed = parseOfferHeuristic(text)
  }
  if (url.trim()) {
    parsed.url = url.trim()
    parsed.source ??= sourceFromUrl(url.trim())
  }
  return parsed
}

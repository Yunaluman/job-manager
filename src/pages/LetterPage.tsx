import { useEffect, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { useApplications } from '../storage'
import { Mail, Copy, Check, Trash2, Loader2, ClipboardPaste, Sparkles } from 'lucide-react'
import {
  useSettings,
  useAnalyses,
  addAnalysis,
  deleteAnalysis,
  buildLetterPrompt,
  callApi,
  hasApiKey,
} from '../cv'
import { ProviderPicker } from '../components/ProviderPicker'
import { AnalysisApplicationLink } from '../components/AnalysisApplicationLink'
import { DraftGuard } from '../components/DraftGuard'
import { useModalFocus } from '../useModalFocus'

const areaClass =
  'app-field'

export function LetterPage() {
  const settings = useSettings()
  const letters = useAnalyses().filter((a) => a.kind === 'lettre')
  const [offer, setOffer] = useState('')
  const [points, setPoints] = useState('')
  const [copied, setCopied] = useState(false)
  const [letterCopied, setLetterCopied] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const modalRef = useModalFocus(pasting, () => setPasting(false))


  // Arrivée depuis une fiche candidature (?app=id) : pré-remplit l'offre
  const { app: appId } = useSearch({ strict: false }) as { app?: string }
  const linked = useApplications().find((a) => a.id === appId)
  useEffect(() => {
    if (linked?.jobText && !offer.trim()) setOffer(linked.jobText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  const ready = settings.cvText.trim().length > 0 && offer.trim().length > 0 && (!appId || Boolean(linked))
  const jobTitle = offer.trim().split('\n')[0].slice(0, 80) || 'Sans titre'
  const current = letters.find((a) => a.id === selected)

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildLetterPrompt(settings, offer, points))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function save(result: string, mode: 'api' | 'manuel') {
    if (appId && !linked) throw new Error('Candidature liée introuvable. La saisie est conservée.')
    const a = await addAnalysis({ jobTitle, result, score: null, mode, kind: 'lettre', applicationId: linked?.id })
    setSelected(a.id)
  }

  async function generate() {
    if (!ready) return
    setLoading(true)
    setError('')
    try {
      // ~380 mots max pour le corps : 1100 tokens suffisent largement
      const result = await callApi(buildLetterPrompt(settings, offer, points), settings, 'letter-generation', 1100)
      setPasteText(result)
      setPasting(true)
      await save(result, 'api')
      setPasteText('')
      setPasting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
    } finally {
      setLoading(false)
    }
  }

  async function copyLetter() {
    if (!current) return
    await navigator.clipboard.writeText(current.result)
    setLetterCopied(true)
    setTimeout(() => setLetterCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <DraftGuard dirty={pasteText.length > 0} />
      {linked && <p className="mb-3 text-sm text-muted">Lettre liée à {linked.company} — {linked.title}. Elle sera visible dans ce dossier.</p>}
      {appId && !linked && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">Le dossier lié est introuvable. Retourne aux candidatures avant de rédiger une lettre.</p>}
      <p className="app-eyebrow">Documents · Lettres</p><h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        <Mail size={22} className="text-indigo-700 dark:text-indigo-400" /> Lettre de motivation
      </h1>
      <p className="mb-8 text-sm text-muted">
        Une lettre ciblée sur l'offre, appuyée uniquement sur ton CV réel — rien d'inventé.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {!settings.cvText.trim() && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Dépose d'abord ton CV dans{' '}
              <Link to="/profil" className="underline">
                Mon profil
              </Link>{' '}
              — il sera utilisé comme matière pour la lettre, avec ton profil pour l'en-tête.
            </p>
          )}
          <section>
            <label className="mb-1.5 block text-xs font-medium text-muted">Fiche de poste</label>
            <textarea
              className={areaClass}
              rows={10}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Colle ici l'offre d'emploi…"
            />
          </section>
          <section>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Points à mettre en avant (optionnel)
            </label>
            <input
              className={areaClass}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="Ex : mon projet perso React, ma connaissance du secteur…"
            />
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={copyPrompt}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-slate-500 disabled:opacity-40"
            >
              {copied ? <Check size={15} className="text-emerald-700 dark:text-emerald-400" /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le prompt'}
            </button>
            <button
              onClick={() => setPasting(true)}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-slate-500 disabled:opacity-40"
            >
              <ClipboardPaste size={15} /> Coller la lettre
            </button>
            {hasApiKey(settings) && (
              <button
                onClick={generate}
                disabled={!ready || loading}
                className="app-primary"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? 'Rédaction…' : `Générer (${settings.model})`}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
          <ProviderPicker />
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">
              Lettres ({letters.length})
            </div>
            {letters.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Aucune lettre pour l'instant.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                {letters.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => setSelected(a.id)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-subtle ${
                      selected === a.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.jobTitle}</div>
                      <div className="text-xs text-muted">
                        {new Date(a.date).toLocaleDateString('fr-FR')} · {a.mode === 'api' ? 'générée' : 'manuelle'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Supprimer cette lettre ?')) void deleteAnalysis(a.id).catch(() => {})
                      }}
                      className="shrink-0 text-muted hover:text-rose-700 dark:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {current && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{current.jobTitle}</h3>
                <button
                  onClick={copyLetter}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-secondary hover:border-slate-500"
                >
                  {letterCopied ? <Check size={12} className="text-emerald-700 dark:text-emerald-400" /> : <Copy size={12} />}
                  {letterCopied ? 'Copiée !' : 'Copier la lettre'}
                </button>
              </div>
              <AnalysisApplicationLink key={current.id} analysis={current} />
              <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-secondary">
                {current.result}
              </div>
            </section>
          )}
        </div>
      </div>

      {pasting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPasting(false)}
        >
          <div
            ref={modalRef} role="dialog" aria-modal="true" aria-label="Coller la lettre"
            onClick={(e) => e.stopPropagation()}
            className="app-modal max-w-lg"
          >
            <h2 className="mb-4 text-lg font-semibold">Coller la lettre rédigée ailleurs</h2>
            <textarea
              className={areaClass}
              rows={12}
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Colle ici la lettre (depuis Claude, ChatGPT…)"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setPasting(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (pasteText.trim()) {
                    try {
                    await save(pasteText, 'manuel')
                    setPasteText('')
                    setPasting(false)
                    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
                  }
                }}
                className="app-primary"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

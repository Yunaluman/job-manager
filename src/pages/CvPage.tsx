import { OriginalLibrary } from '../components/OriginalLibrary'
import { AnalysisContent } from '../components/AnalysisContent'
import { useEffect, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useApplications } from '../storage'
import {
  Sparkles,
  Copy,
  Check,
  Trash2,
  Loader2,
  ClipboardPaste,
  FileUp,
} from 'lucide-react'
import { extractTextFromFile } from '../extract'
import {
  useSettings,
  useAnalyses,
  saveSettings,
  addAnalysis,
  deleteAnalysis,
  buildPrompt,
  analyzeWithApi,
  extractScore,
  hasApiKey,
} from '../cv'
import { ProviderPicker } from '../components/ProviderPicker'
import { AnalysisApplicationLink } from '../components/AnalysisApplicationLink'
import { DraftGuard } from '../components/DraftGuard'
import { useModalFocus } from '../useModalFocus'
import { useData } from '../data'
import { cvText } from '../cv-document.mjs'
import type { CvContent } from '../document-types'

const areaClass =
  'app-field'

function scoreColor(score: number) {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  if (score >= 50) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
  return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
}

export function CvPage() {
  const settings = useSettings()
  const [cvDraft, setCvDraft] = useState<string | null>(null)
  const analyses = useAnalyses().filter((a) => a.kind !== 'lettre')
  const [offer, setOffer] = useState('')
  const [copied, setCopied] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const modalRef = useModalFocus(pasting, () => setPasting(false))


  // Arrivée depuis une fiche candidature (?app=id) : pré-remplit l'offre
  const { app: appId } = useSearch({ strict: false }) as { app?: string }
  const linked = useApplications().find((a) => a.id === appId)
  const { journey } = useData()
  const [cvVersionId, setCvVersionId] = useState('')
  const cvVersions = journey.documentVersions.filter(version => version.templateVersion === 'single-column-cv-v1' && journey.documents.some(doc => doc.id === version.documentId && (!doc.applicationId || doc.applicationId === appId)))
  const selectedCv = cvVersions.find(version => version.id === cvVersionId)
  const selectedText = selectedCv ? cvText(selectedCv.content as CvContent, selectedCv.layout) : settings.cvText
  const sourceFields = { cvText: selectedText, offerText: offer, ...(selectedCv ? { cvVersionId: selectedCv.id } : {}) }
  useEffect(() => {
    if (linked?.jobText && !offer.trim()) setOffer(linked.jobText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  const ready = selectedText.trim().length > 0 && offer.trim().length > 0 && (!appId || Boolean(linked))
  const key = hasApiKey(settings)
  const jobTitle = offer.trim().split('\n')[0].slice(0, 80) || 'Sans titre'

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(selectedText, offer))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function savePasted() {
    if (!pasteText.trim()) return
    try {
    if (appId && !linked) throw new Error('Candidature liée introuvable. La saisie est conservée.')
    const a = await addAnalysis({ jobTitle, result: pasteText, score: extractScore(pasteText), mode: 'manuel', applicationId: linked?.id, ...sourceFields })
    setSelected(a.id)
    setPasteText('')
    setPasting(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
  }

  async function runApi() {
    if (!ready) return
    setLoading(true)
    setError('')
    try {
      const result = await analyzeWithApi(selectedText, offer, settings)
      setPasteText(result)
      setPasting(true)
      const a = await addAnalysis({ jobTitle, result, score: extractScore(result), mode: 'api', applicationId: linked?.id, ...sourceFields })
      setSelected(a.id)
      setPasteText('')
      setPasting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
    } finally {
      setLoading(false)
    }
  }

  const current = analyses.find((a) => a.id === selected)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setExtracting(true)
    setError('')
    try {
      const text = await extractTextFromFile(file)
      if (!text) throw new Error('Aucun texte trouvé dans ce fichier (CV scanné en image ?).')
      setCvDraft(text)
      await saveSettings({ cvText: text })
      setCvDraft((current) => current === text ? null : current)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de lire ce fichier.")
    } finally {
      setExtracting(false)
    }
  }

  function pickFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.docx,.txt,.md'
    input.onchange = () => handleFile(input.files?.[0])
    input.click()
  }

  return (
    <div className="mx-auto max-w-6xl">
      <DraftGuard dirty={cvDraft !== null || pasteText.length > 0} />
      {linked && <p className="mb-3 text-sm text-muted">Analyse liée à {linked.company} — {linked.title}. Elle sera visible dans ce dossier.</p>}
      {appId && !linked && <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-300">Le dossier lié est introuvable. Retourne aux candidatures avant de lancer une analyse.</p>}
      <p className="app-eyebrow">Documents · Analyse</p><h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        <Sparkles size={22} className="text-indigo-700 dark:text-indigo-400" /> Analyse du CV
      </h1>
      <p className="mb-8 text-sm text-muted">
        Évaluer les correspondances, écarts et inconnues. Les notes restent indicatives ; aucune compatibilité ATS ou probabilité d’embauche n’est mesurée.
      </p>

      <details className="mb-6"><summary className="app-button cursor-pointer">Choisir un fichier CV original</summary><OriginalLibrary onSelect={value => setCvDraft(value.text)} /></details>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="app-panel p-5">
            <label className="mb-4 block text-sm">Version du CV analysée<select className="app-field" disabled={loading} value={cvVersionId} onChange={(event)=>setCvVersionId(event.target.value)}><option value="">Texte source du profil</option>{cvVersions.map(version=><option value={version.id} key={version.id}>{version.title} · v{version.number} · {new Date(version.createdAt).toLocaleDateString('fr-FR')}</option>)}</select></label>
            {selectedCv && <details className="mb-4"><summary>Contenu exact du CV sélectionné</summary><pre className="whitespace-pre-wrap text-sm">{selectedText}</pre></details>}
            <details className="mt-4"><summary className="text-sm font-medium">Lire ou modifier le texte source{cvDraft!==null && <span className="ml-2 text-xs text-amber-700">À enregistrer</span>}</summary><div className="mt-3">            <label className="mb-1.5 block text-xs font-medium text-muted">
              Ton CV — dépose le fichier ou colle le texte (mémorisé)
            </label>
            <button
              type="button"
              onClick={pickFile}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                void handleFile(e.dataTransfer.files?.[0])
              }}
              className={`mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors ${
                dragOver
                  ? 'border-indigo-400 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'border-line text-muted hover:border-slate-500 hover:text-ink'
              }`}
            >
              {extracting ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
              {extracting
                ? 'Extraction du texte…'
                : 'Extraire un texte sans conserver le fichier'}
            </button>
            <textarea
              className={areaClass}
              rows={8}
              aria-label="Texte source du CV"
              value={cvDraft ?? settings.cvText}
              onChange={(e) => setCvDraft(e.target.value)}
              placeholder="…ou colle ici le contenu texte de ton CV"
            />
            {cvDraft !== null && <button className="mt-2 text-sm underline" onClick={async () => {
              const submitted = cvDraft
              try { await saveSettings({ cvText: submitted }); setCvDraft((current) => current === submitted ? null : current); setError('') }
              catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
            }}>Enregistrer le CV</button>}
</div></details>
          </section>
          <section className="app-panel p-5">
            <label className="mb-1.5 block text-xs font-medium text-muted">Fiche de poste</label>
            <textarea
              aria-label="Fiche de poste"
              className={areaClass}
              rows={6}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Colle ici l'offre d'emploi (LinkedIn, HelloWork, Indeed…)"
            />
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={copyPrompt}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-slate-500 disabled:opacity-40"
            >
              {copied ? <Check size={15} className="text-emerald-700 dark:text-emerald-400" /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le prompt (Claude / ChatGPT / Mistral)'}
            </button>
            <button
              onClick={() => setPasting(true)}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-slate-500 disabled:opacity-40"
            >
              <ClipboardPaste size={15} /> Coller le résultat
            </button>
            {key && (
              <button
                onClick={runApi}
                disabled={!ready || loading}
                className="app-primary"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? 'Analyse en cours…' : `Analyser (${settings.model})`}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}

          <details className="app-panel p-5"><summary className="text-sm font-semibold">Fournisseur et modèle IA</summary><div className="mt-4"><ProviderPicker withKeys /></div></details>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!current && <div className="app-empty"><Sparkles size={28} className="mx-auto mb-4 text-[#148268]" aria-hidden="true" /><h2 className="text-xl font-semibold">Une lecture claire de ton CV</h2><p className="mt-2 text-sm text-muted">Choisis tes sources pour lancer une analyse, ou ouvre un résultat dans l’historique.</p></div>}
          {current && (
            <section className="app-panel p-5 sm:p-7"><p className="app-eyebrow">Résultat · analyse historique</p>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{current.jobTitle}</h3>
                {current.score !== null && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-sm font-bold ${scoreColor(current.score)}`}>
                    {current.score}/100
                  </span>
                )}
              </div>
              <AnalysisApplicationLink key={current.id} analysis={current} />
              <p className="mb-4 text-xs text-muted">Note historique indicative ; elle ne constitue pas une décision.</p><AnalysisContent text={current.result} />
            </section>
          )}
          <section className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold">
              Historique des analyses ({analyses.length})
            </div>
            {analyses.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">
                Aucune analyse pour l'instant.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {analyses.map((a) => (
                  <li
                    key={a.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-subtle ${
                      selected === a.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <button type="button" onClick={() => setSelected(a.id)} className="min-w-0 flex-1 text-left">
                      <div className="truncate font-medium">{a.jobTitle}</div>
                      <div className="text-xs text-muted">
                        {new Date(a.date).toLocaleDateString('fr-FR')} · {a.mode === 'api' ? 'API · fournisseur historique non renseigné' : 'manuel'}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.score !== null && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreColor(a.score)}`}>
                          {a.score}/100
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm('Supprimer cette analyse ?')) void deleteAnalysis(a.id).catch(() => {})
                        }}
                        className="text-muted hover:text-rose-700 dark:text-rose-400"
                      >
                        <Trash2 aria-label="Supprimer cette analyse" size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>

      {pasting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPasting(false)}
        >
          <div
            ref={modalRef} role="dialog" aria-modal="true" aria-label="Coller la réponse de l’IA"
            onClick={(e) => e.stopPropagation()}
            className="app-modal max-w-lg"
          >
            <h2 className="mb-4 text-lg font-semibold">Coller la réponse de l'IA</h2>
            <textarea
              className={areaClass}
              rows={12}
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Colle ici la réponse complète de Claude / ChatGPT / Mistral…"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setPasting(false)} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-ink">
                Annuler
              </button>
              <button
                onClick={savePasted}
                className="app-primary"
              >
                Enregistrer l'analyse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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
import { DraftGuard } from '../components/DraftGuard'

const areaClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

function scoreColor(score: number) {
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (score >= 50) return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
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


  // Arrivée depuis une fiche candidature (?app=id) : pré-remplit l'offre
  const { app: appId } = useSearch({ strict: false }) as { app?: string }
  const linked = useApplications().find((a) => a.id === appId)
  useEffect(() => {
    if (linked?.jobText && !offer.trim()) setOffer(linked.jobText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  const ready = settings.cvText.trim().length > 0 && offer.trim().length > 0
  const key = hasApiKey(settings)
  const jobTitle = offer.trim().split('\n')[0].slice(0, 80) || 'Sans titre'

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildPrompt(settings.cvText, offer))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function savePasted() {
    if (!pasteText.trim()) return
    try {
    const a = await addAnalysis({ jobTitle, result: pasteText, score: extractScore(pasteText), mode: 'manuel' })
    setSelected(a.id)
    setPasteText('')
    setPasting(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
  }

  async function runApi() {
    setLoading(true)
    setError('')
    try {
      const result = await analyzeWithApi(settings.cvText, offer, settings)
      setPasteText(result)
      setPasting(true)
      const a = await addAnalysis({ jobTitle, result, score: extractScore(result), mode: 'api' })
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
    <div className="mx-auto max-w-5xl">
      <DraftGuard dirty={cvDraft !== null || pasteText.length > 0} />
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Sparkles size={22} className="text-indigo-400" /> Amélioration CV
      </h1>
      <p className="mb-8 text-sm text-slate-400">
        Un recruteur senior (IA) note ton CV sur 100 face à une offre précise et te dit quoi améliorer.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <section>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
                  ? 'border-indigo-400 bg-indigo-500/10 text-indigo-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              {extracting ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
              {extracting
                ? 'Extraction du texte…'
                : 'Déposer mon CV (PDF, DOCX, TXT) — traité localement, jamais envoyé'}
            </button>
            <textarea
              className={areaClass}
              rows={8}
              value={cvDraft ?? settings.cvText}
              onChange={(e) => setCvDraft(e.target.value)}
              placeholder="…ou colle ici le contenu texte de ton CV"
            />
            {cvDraft !== null && <button className="mt-2 text-sm underline" onClick={async () => {
              const submitted = cvDraft
              try { await saveSettings({ cvText: submitted }); setCvDraft((current) => current === submitted ? null : current); setError('') }
              catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
            }}>Enregistrer le CV</button>}
          </section>
          <section>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Fiche de poste</label>
            <textarea
              className={areaClass}
              rows={9}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Colle ici l'offre d'emploi (LinkedIn, HelloWork, Indeed…)"
            />
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={copyPrompt}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le prompt (Claude / ChatGPT / Mistral)'}
            </button>
            <button
              onClick={() => setPasting(true)}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
            >
              <ClipboardPaste size={15} /> Coller le résultat
            </button>
            {key && (
              <button
                onClick={runApi}
                disabled={!ready || loading}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-50"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? 'Analyse en cours…' : `Analyser (${settings.model})`}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}

          <ProviderPicker withKeys />
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold">
              Analyses ({analyses.length})
            </div>
            {analyses.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Aucune analyse pour l'instant.
              </p>
            ) : (
              <ul className="max-h-56 divide-y divide-slate-800 overflow-y-auto">
                {analyses.map((a) => (
                  <li
                    key={a.id}
                    onClick={() => setSelected(a.id)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-800/40 ${
                      selected === a.id ? 'bg-indigo-500/10' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.jobTitle}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(a.date).toLocaleDateString('fr-FR')} · {a.mode === 'api' ? 'Mistral' : 'manuel'}
                      </div>
                    </div>
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
                        className="text-slate-600 hover:text-rose-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {current && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{current.jobTitle}</h3>
                {current.score !== null && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-sm font-bold ${scoreColor(current.score)}`}>
                    {current.score}/100
                  </span>
                )}
              </div>
              <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
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
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
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
              <button onClick={() => setPasting(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-100">
                Annuler
              </button>
              <button
                onClick={savePasted}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
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

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Mail, Copy, Check, Trash2, Loader2, ClipboardPaste, Sparkles } from 'lucide-react'
import {
  useSettings,
  useAnalyses,
  addAnalysis,
  deleteAnalysis,
  buildLetterPrompt,
  callApi,
  activeKey,
} from '../cv'
import { ProviderPicker } from '../components/ProviderPicker'

const areaClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

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

  const ready = settings.cvText.trim().length > 0 && offer.trim().length > 0
  const jobTitle = offer.trim().split('\n')[0].slice(0, 80) || 'Sans titre'
  const current = letters.find((a) => a.id === selected)

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildLetterPrompt(settings.cvText, offer, points))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function save(result: string, mode: 'api' | 'manuel') {
    const a = addAnalysis({ jobTitle, result, score: null, mode, kind: 'lettre' })
    setSelected(a.id)
  }

  async function generate() {
    setLoading(true)
    setError('')
    try {
      save(await callApi(buildLetterPrompt(settings.cvText, offer, points), settings), 'api')
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
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Mail size={22} className="text-indigo-400" /> Lettre de motivation
      </h1>
      <p className="mb-8 text-sm text-slate-400">
        Une lettre ciblée sur l'offre, appuyée uniquement sur ton CV réel — rien d'inventé.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          {!settings.cvText.trim() && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              Dépose d'abord ton CV sur la page{' '}
              <Link to="/cv" className="underline">
                Amélioration CV
              </Link>{' '}
              — il sera utilisé comme matière pour la lettre.
            </p>
          )}
          <section>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Fiche de poste</label>
            <textarea
              className={areaClass}
              rows={10}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Colle ici l'offre d'emploi…"
            />
          </section>
          <section>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
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
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier le prompt'}
            </button>
            <button
              onClick={() => setPasting(true)}
              disabled={!ready}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-40"
            >
              <ClipboardPaste size={15} /> Coller la lettre
            </button>
            {activeKey(settings) && (
              <button
                onClick={generate}
                disabled={!ready || loading}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:opacity-50"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {loading ? 'Rédaction…' : `Générer (${settings.model})`}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <ProviderPicker />
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold">
              Lettres ({letters.length})
            </div>
            {letters.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Aucune lettre pour l'instant.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-slate-800 overflow-y-auto">
                {letters.map((a) => (
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
                        {new Date(a.date).toLocaleDateString('fr-FR')} · {a.mode === 'api' ? 'générée' : 'manuelle'}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Supprimer cette lettre ?')) deleteAnalysis(a.id)
                      }}
                      className="shrink-0 text-slate-600 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {current && (
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{current.jobTitle}</h3>
                <button
                  onClick={copyLetter}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500"
                >
                  {letterCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {letterCopied ? 'Copiée !' : 'Copier la lettre'}
                </button>
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
              <button onClick={() => setPasting(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-100">
                Annuler
              </button>
              <button
                onClick={() => {
                  if (pasteText.trim()) {
                    save(pasteText, 'manuel')
                    setPasteText('')
                    setPasting(false)
                  }
                }}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
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

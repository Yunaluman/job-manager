import { useEffect, useState } from 'react'
import { User, FileUp, Loader2 } from 'lucide-react'
import { useSettings, saveSettings } from '../cv'
import { extractTextFromFile } from '../extract'
import { DraftGuard } from '../components/DraftGuard'
import { CvDocumentsPanel } from '../components/CvDocumentsPanel'
import { OrphanDocuments } from '../components/OrphanDocuments'

const inputClass =
  'app-field'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

export function ProfilePage() {
  const confirmed = useSettings()
  const [draft, setDraft] = useState<Partial<typeof confirmed>>({})
  const settings = { ...confirmed, ...draft }
  const [saving, setSaving] = useState(false)
  const dirty = Object.keys(draft).length > 0

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')

  const set = (k: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((previous) => ({ ...previous, [k]: e.target.value }))

  async function saveProfile() {
    if (saving) return
    setSaving(true)
    setFileError('')
    const submitted = draft
    try {
      await saveSettings(submitted)
      setDraft((current) => Object.fromEntries(Object.entries(current).filter(([key, value]) => submitted[key as keyof typeof submitted] !== value)))
    }
    catch (error) { setFileError(error instanceof Error ? error.message : 'Enregistrement non confirmé.') }
    finally { setSaving(false) }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setExtracting(true)
    setFileError('')
    try {
      const text = await extractTextFromFile(file)
      if (!text) throw new Error('Aucun texte trouvé dans ce fichier (CV scanné en image ?).')
      setDraft((previous) => ({ ...previous, cvText: text }))
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Impossible de lire ce fichier.')
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
    <div className="mx-auto max-w-3xl">
      <DraftGuard dirty={dirty} />
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        <User size={22} className="text-indigo-700 dark:text-indigo-400" /> Mon profil
      </h1>
      <p className="mb-8 text-sm text-muted">
        Ton identité et ton CV — la matière première des analyses et des lettres. Enregistre les modifications avant de quitter cette page.
      </p>

      <div className="flex flex-col gap-6">
        <CvDocumentsPanel />
        <OrphanDocuments />
        <button disabled={!dirty || saving} onClick={() => void saveProfile()} className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer le profil et le CV'}</button>
        {fileError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{fileError}</p>}
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <User size={15} className="text-muted" /> Identité
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom complet">
              <input className={inputClass} value={settings.profileName} onChange={set('profileName')} placeholder="Prénom NOM" />
            </Field>
            <Field label="Poste recherché">
              <input className={inputClass} value={settings.profileTitle} onChange={set('profileTitle')} placeholder="Ex : Développeur backend / data" />
            </Field>
            <Field label="Email">
              <input type="email" className={inputClass} value={settings.profileEmail} onChange={set('profileEmail')} />
            </Field>
            <Field label="Téléphone">
              <input className={inputClass} value={settings.profilePhone} onChange={set('profilePhone')} />
            </Field>
            <Field label="Ville (code postal + ville)">
              <input className={inputClass} value={settings.profileCity} onChange={set('profileCity')} placeholder="94230 Cachan" />
            </Field>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Utilisé pour l'en-tête des lettres de motivation (coordonnées, date, objet) — comme sur
            une vraie lettre.
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileUp size={15} className="text-muted" /> Mon CV
          </div>
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
              : 'Déposer mon CV (PDF, DOCX, TXT) — traité localement, jamais envoyé'}
          </button>
          {fileError && <p className="mb-2 text-sm text-rose-700 dark:text-rose-400">{fileError}</p>}
          <textarea
            className={inputClass}
            rows={8}
            value={settings.cvText}
            onChange={(e) => setDraft((previous) => ({ ...previous, cvText: e.target.value }))}
            placeholder="…ou colle ici le contenu texte de ton CV"
          />
          <p className="mt-2 text-[11px] text-muted">
            Ce CV alimente l'analyse (page Amélioration CV) et les lettres de motivation.
          </p>
        </section>
      </div>
    </div>
  )
}

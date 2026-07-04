import { useState } from 'react'
import { Settings as SettingsIcon, User, FileUp, Loader2 } from 'lucide-react'
import { useSettings, saveSettings } from '../cv'
import { extractTextFromFile } from '../extract'
import { ProviderPicker } from '../components/ProviderPicker'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-400">
      {label}
      {children}
    </label>
  )
}

export function SettingsPage() {
  const settings = useSettings()
  const [extracting, setExtracting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')

  const set = (k: keyof typeof settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    saveSettings({ [k]: e.target.value })

  async function handleFile(file: File | undefined) {
    if (!file) return
    setExtracting(true)
    setFileError('')
    try {
      const text = await extractTextFromFile(file)
      if (!text) throw new Error('Aucun texte trouvé dans ce fichier (CV scanné en image ?).')
      saveSettings({ cvText: text })
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
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <SettingsIcon size={22} className="text-indigo-400" /> Paramètres
      </h1>
      <p className="mb-8 text-sm text-slate-400">
        Ton profil, ton CV et tes fournisseurs IA — tout est sauvegardé automatiquement.
      </p>

      <div className="flex flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <User size={15} className="text-slate-400" /> Mon profil
          </div>
          <div className="grid grid-cols-2 gap-4">
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
          <p className="mt-3 text-[11px] text-slate-500">
            Utilisé pour l'en-tête des lettres de motivation (coordonnées, date, objet) — comme sur
            une vraie lettre.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileUp size={15} className="text-slate-400" /> Mon CV
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
                ? 'border-indigo-400 bg-indigo-500/10 text-indigo-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {extracting ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />}
            {extracting
              ? 'Extraction du texte…'
              : 'Déposer mon CV (PDF, DOCX, TXT) — traité localement, jamais envoyé'}
          </button>
          {fileError && <p className="mb-2 text-sm text-rose-400">{fileError}</p>}
          <textarea
            className={inputClass}
            rows={8}
            value={settings.cvText}
            onChange={(e) => saveSettings({ cvText: e.target.value })}
            placeholder="…ou colle ici le contenu texte de ton CV"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            Ce CV alimente l'analyse (page Amélioration CV) et les lettres de motivation.
          </p>
        </section>

        <ProviderPicker withKeys />
      </div>
    </div>
  )
}

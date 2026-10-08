import { Settings as SettingsIcon, Database, Download, Upload, FileSpreadsheet } from 'lucide-react'
import { exportExcel, exportJSON, importJSON } from '../storage'
import { ProviderPicker } from '../components/ProviderPicker'

function downloadJSON() {
  const blob = new Blob([exportJSON()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `jobpilot-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const n = importJSON(await file.text())
      alert(`${n} candidature(s) importée(s).`)
    } catch {
      alert("Fichier invalide — l'import a échoué.")
    }
  }
  input.click()
}

const btnClass =
  'flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-slate-500'

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <SettingsIcon size={22} className="text-indigo-400" /> Paramètres
      </h1>
      <p className="mb-8 text-sm text-slate-400">
        Réglages de l'application : fournisseur IA et données. Ton identité et ton CV sont dans{' '}
        <span className="text-slate-300">Mon profil</span>.
      </p>

      <div className="flex flex-col gap-6">
        <ProviderPicker withKeys />

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Database size={15} className="text-slate-400" /> Mes données
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void exportExcel()} className={btnClass}>
              <FileSpreadsheet size={15} /> Exporter en Excel
            </button>
            <button onClick={downloadJSON} className={btnClass}>
              <Download size={15} /> Exporter en JSON
            </button>
            <button onClick={triggerImport} className={btnClass}>
              <Upload size={15} /> Importer un JSON
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Tout est stocké localement dans une base SQLite
            (%LOCALAPPDATA%\JobPilot\jobpilot.db). L'export JSON contient les candidatures ;
            l'Excel sert à consulter/partager. Ces exports ne contiennent pas les clés API.
            Pour copier la base, ferme d'abord JobPilot ; une copie pendant son utilisation
            peut être incomplète.
          </p>
        </section>
      </div>
    </div>
  )
}

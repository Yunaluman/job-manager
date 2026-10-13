import { Button } from '../../shared/ui/Button'
import { Settings as SettingsIcon, Database, Download, Upload, FileSpreadsheet } from 'lucide-react'
import { exportExcel, exportJSON, importJSON } from '../../storage'
import { ProviderPicker } from '../activity/ProviderPicker'
import { apiRequest } from '../../api'
import { dataStore } from '../../data'
import { RegisterImport } from './RegisterImport'

async function backupDatabase() {
  try {
    await dataStore.idle()
    const result = await apiRequest<{ verified: boolean; path: string }>('POST', 'backups', {})
    if (!result.verified) throw new Error('Sauvegarde non vérifiée.')
    alert(`Sauvegarde chiffrée vérifiée : ${result.path}`)
  } catch (error) { alert(error instanceof Error ? error.message : 'Sauvegarde impossible.') }
}

async function downloadJSON() {
  try {
  const blob = new Blob([await exportJSON()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `jobpilot-export-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  } catch (error) { alert(error instanceof Error ? error.message : 'Export impossible.') }
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const json = await file.text()
      const parsed = JSON.parse(json)
      if (!Array.isArray(parsed)) throw new Error('Cet import accepte les anciens exports de candidatures. Une sauvegarde complète se restaure dans une nouvelle base avec le script de restauration.')
      if (!confirm(`Remplacer toutes les candidatures par ${parsed.length} entrée(s) ? Une sauvegarde chiffrée sera vérifiée avant le remplacement.`)) return
      await dataStore.idle()
      const backup = await apiRequest<{ verified: boolean }>('POST', 'backups', {})
      if (!backup.verified) throw new Error('Sauvegarde préalable non vérifiée : import annulé.')
      const n = await importJSON(json)
      alert(`${n} candidature(s) importée(s).`)
    } catch (error) {
      alert(error instanceof Error ? error.message : "L'import n'a pas été confirmé.")
    }
  }
  input.click()
}

const btnClass =
  'app-button'

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="app-eyebrow">Configuration</p><h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        <SettingsIcon size={22} className="text-indigo-700 dark:text-indigo-400" /> Paramètres
      </h1>
      <p className="mb-8 text-sm text-muted">
        Réglages de l'application : fournisseur IA et données. Ton identité et ton CV sont dans{' '}
        <span className="text-secondary">Mon profil</span>.
      </p>

      <nav className="app-jump" aria-label="Sections des paramètres"><a href="#settings-provider">Fournisseur IA</a><a href="#settings-register">Registre CSV</a><a href="#settings-data">Sauvegardes et exports</a></nav><div className="flex flex-col gap-6">
        <section id="settings-provider"><ProviderPicker withKeys /></section>
        <section id="settings-register"><RegisterImport /></section>

        <section id="settings-data" className="app-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Database size={15} className="text-muted" /> Mes données
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" onClick={() => void backupDatabase()} className={btnClass}><Database size={15} /> Sauvegarder la base chiffrée</Button>
            <Button type="submit" onClick={() => void exportExcel()} className={btnClass}>
              <FileSpreadsheet size={15} /> Exporter en Excel
            </Button>
            <Button type="submit" onClick={downloadJSON} className={btnClass}>
              <Download size={15} /> Exporter en JSON
            </Button>
            <Button type="submit" onClick={triggerImport} className={btnClass}>
              <Upload size={15} /> Importer un JSON
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Tout est stocké localement dans une base SQLite
            (%LOCALAPPDATA%\JobPilot\jobpilot.db). L'export JSON complet version 6 contient candidatures, offres, qualifications, documents, CV, profil, suivi IA, actions, entretiens planifiés et lectures des notifications ;
            l'Excel sert à consulter/partager. Ces exports ne contiennent pas les clés API.
            Pour copier la base, ferme d'abord JobPilot ; une copie pendant son utilisation
            peut être incomplète.
          </p>
        </section>
      </div>
    </div>
  )
}

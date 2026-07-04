import { Link, Outlet } from '@tanstack/react-router'
import { Briefcase, LayoutDashboard, KanbanSquare, FileText, Download, Upload, FileSpreadsheet, Mail, Settings } from 'lucide-react'
import { exportExcel, exportJSON, importJSON } from '../storage'

function downloadExport() {
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

const linkClass =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 transition-colors [&.active]:bg-indigo-500/15 [&.active]:text-indigo-300'

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
            <Briefcase size={18} />
          </div>
          <div>
            <div className="font-bold tracking-tight">JobPilot</div>
            <div className="text-[11px] text-slate-500">Suivi de candidatures</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          <Link to="/" className={linkClass} activeOptions={{ exact: true }}>
            <LayoutDashboard size={16} /> Tableau de bord
          </Link>
          <Link to="/candidatures" className={linkClass}>
            <KanbanSquare size={16} /> Candidatures
          </Link>
          <Link to="/cv" className={linkClass}>
            <FileText size={16} /> Amélioration CV
          </Link>
          <Link to="/lettre" className={linkClass}>
            <Mail size={16} /> Lettre de motivation
          </Link>
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-slate-800 pt-3">
          <Link to="/parametres" className={linkClass}>
            <Settings size={16} /> Paramètres
          </Link>
          <button onClick={() => exportExcel()} className={linkClass}>
            <FileSpreadsheet size={16} /> Exporter (Excel)
          </button>
          <button onClick={downloadExport} className={linkClass}>
            <Download size={16} /> Exporter (JSON)
          </button>
          <button onClick={triggerImport} className={linkClass}>
            <Upload size={16} /> Importer
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-8">
        <Outlet />
      </main>
    </div>
  )
}

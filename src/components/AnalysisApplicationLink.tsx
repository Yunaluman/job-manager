import { useState } from 'react'
import { useApplications } from '../storage'
import { linkAnalysis } from '../cv'
import type { CvAnalysis } from '../cv'

export function AnalysisApplicationLink({ analysis }: { analysis: CvAnalysis }) {
  const applications = useApplications()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const missing = analysis.applicationId && !applications.some((app) => app.id === analysis.applicationId)
  return <div className="mb-3">
    <label className="text-sm text-muted">Candidature liée
      <select className="app-field mt-1" value={analysis.applicationId ?? ''} disabled={saving} onChange={async (e) => {
        const id = e.target.value || undefined
        setSaving(true); setError('')
        try { await linkAnalysis(analysis.id, id) }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Rattachement non confirmé.') }
        finally { setSaving(false) }
      }}>
        <option value="">Aucun dossier lié</option>
        {missing && <option value={analysis.applicationId}>Dossier supprimé — lien historique</option>}
        {applications.map((app) => <option key={app.id} value={app.id}>{app.company} — {app.title}</option>)}
      </select>
    </label>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
  </div>
}

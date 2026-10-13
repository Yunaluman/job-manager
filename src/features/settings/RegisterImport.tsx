import { Button } from '../../shared/ui/Button'
import { useRef, useState } from 'react'
import { previewRegister, importRegister } from '../../register'
import type { RegisterPreview, RegisterResolution } from '../../register'
import { DraftGuard } from '../../components/DraftGuard'
import { useModalFocus } from '../../useModalFocus'

const pageSize = 20
const describe = (value: unknown) => value === null ? '—' : typeof value === 'string' ? value : JSON.stringify(value)

export function RegisterImport() {
  const [source, setSource] = useState<{ csv: string; name: string } | null>(null)
  const [preview, setPreview] = useState<RegisterPreview | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [distinct, setDistinct] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const modal = useModalFocus<HTMLDivElement>(confirming, () => { if (!inFlight.current) setConfirming(false) })
  async function load(csv: string, name: string) {
    const next = await previewRegister(csv, name)
    setPreview(next); setChoices(Object.fromEntries(next.rows.map((row) => [row.rowKey, row.defaultTarget ? `local:${row.defaultTarget}` : row.candidates.length ? '' : 'new'])))
    setSelected({}); setDistinct({}); setPage(0)
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(''); setSuccess('')
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Opération non confirmée. La sélection est conservée.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const selectedRows = preview?.rows.filter((row) => selected[row.rowKey]) ?? []
  const resolutions: RegisterResolution[] = selectedRows.map((row) => ({ rowKey: row.rowKey,
    targetId: choices[row.rowKey] === 'new' ? null : choices[row.rowKey]?.slice(6), allowDuplicate: distinct[row.rowKey] === true }))
  const validSelection = selectedRows.length > 0 && selectedRows.every((row) => choices[row.rowKey] && !row.errors.length && !row.unchanged &&
    (choices[row.rowKey] !== 'new' || (!row.candidates.length && !row.duplicateIdentity) || distinct[row.rowKey]))
  return <section className="app-panel p-5">
    <DraftGuard dirty={selectedRows.length > 0} />
    <h2 className="mb-3 font-semibold">Registre des candidatures CSV</h2>
    <p className="mb-3 text-sm text-muted">Le CSV reste la source de vérité. JobPilot conserve une copie en lecture seule des lignes sélectionnées. Les analyses et lettres restent des brouillons locaux.</p>
    <label className="block text-sm">Choisir le registre CSV (UTF-8, point-virgule, maximum 2 Mo)
      <input type="file" accept=".csv,text/csv" disabled={busy} className="app-field mt-2" onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) return
        setSource(null); setPreview(null); setSelected({})
        void run(async () => {
          if (file.size > 2_000_000) throw new Error('Fichier trop volumineux (maximum 2 Mo).')
          const csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer())
          setSource({ csv, name: file.name }); await load(csv, file.name)
        })
      }} />
    </label>
    {source && <Button type="submit" className="app-button mt-3" disabled={busy} onClick={() => void run(() => load(source.csv, source.name))}>Recalculer l’aperçu et effacer les choix</Button>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {success && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
    {preview && <>
      <p className="my-4 text-sm">{preview.rows.length} ligne(s) · {preview.rows.filter((row) => row.errors.length).length} invalide(s) · {preview.rows.filter((row) => row.unchanged).length} inchangée(s). Aucune ligne n’est sélectionnée automatiquement.</p>
      <p className="mb-4 break-all text-xs text-muted">Empreinte SHA-256 : {preview.fileSha256}</p>
      {preview.missing.length > 0 && <details className="mb-4 text-sm"><summary>{preview.missing.length} dossier(s) précédemment importé(s) absent(s) de ce fichier — conservés</summary>
        <ul>{preview.missing.map((app) => <li key={app.id}>{app.externalId} — {app.company} — {app.title}</li>)}</ul>
        <p className="text-muted">Leur ancienne copie reste visible avec sa date d’import. Aucune disparition ne déclenche une suppression automatique.</p>
      </details>}
      <div className="space-y-4">{preview.rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => {
        const choice = choices[row.rowKey] ?? ''
        const target = row.candidates.find((candidate) => `local:${candidate.id}` === choice)
        return <article key={row.rowKey} className="rounded-xl border border-line p-4">
          <label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" disabled={busy || row.errors.length > 0 || row.unchanged} checked={selected[row.rowKey] === true} onChange={(event) => setSelected((value) => ({ ...value, [row.rowKey]: event.target.checked }))} />
            <span>{row.externalId} — {row.fields.company} — {row.fields.title}</span>
          </label>
          <p className="mt-2 text-sm text-muted">{row.fields.location || 'Lieu non renseigné'} · Statut CSV : {row.raw.statut} · {row.fields.disposition === 'active' ? 'En cours' : row.fields.disposition === 'archived' ? 'Abandonné' : 'Écarté'}{row.unchanged && ' · Inchangé'}</p>
          {row.errors.length > 0 && <ul className="mt-2 text-sm text-rose-700 dark:text-rose-300">{row.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
          {!row.errors.length && !row.unchanged && <>
            <label className="mt-3 block text-sm">Action pour {row.externalId}
              <select className="app-field mt-1" value={choice} disabled={busy} onChange={(event) => setChoices((value) => ({ ...value, [row.rowKey]: event.target.value }))}>
                <option value="">Choisir un rapprochement</option>
                <option value="new" disabled={Boolean(row.defaultTarget)}>Créer un nouveau dossier</option>
                {row.candidates.map((candidate) => <option key={candidate.id} value={`local:${candidate.id}`} disabled={candidate.immutable && candidate.externalId !== row.externalId}>{candidate.company} — {candidate.title} — {candidate.location || 'lieu inconnu'} ({candidate.reason === 'external-id' ? 'identifiant externe' : candidate.reason === 'identity' ? 'identité similaire' : 'URL similaire'})</option>)}
              </select>
            </label>
            {(row.duplicateIdentity || row.candidates.length > 0) && choice === 'new' && <label className="mt-3 flex gap-2 text-sm text-amber-700 dark:text-amber-300"><input type="checkbox" disabled={busy} checked={distinct[row.rowKey] === true} onChange={(event) => setDistinct((value) => ({ ...value, [row.rowKey]: event.target.checked }))} />Je confirme que cette candidature est distincte des doublons possibles.</label>}
            {target && <details className="mt-3 text-sm"><summary>Champs remplacés dans le dossier local ({Object.keys(target.changes).length})</summary>
              <p className="my-2 text-amber-700 dark:text-amber-300">Ce dossier passera en lecture seule sous l’autorité du CSV. Les dates du registre seront ajoutées ; les étapes locales déjà datées seront conservées comme archive historique. Une sauvegarde chiffrée sera vérifiée avant toute écriture.</p>
              <dl className="max-h-72 space-y-2 overflow-auto break-words">{Object.entries(target.changes).map(([key, change]) => <div key={key}><dt className="font-medium">{key}</dt><dd className="whitespace-pre-wrap text-muted">Avant : {describe(change.before)}<br />Après : {describe(change.after)}</dd></div>)}</dl>
            </details>}
          </>}
          <details className="mt-3 text-sm"><summary>Voir toutes les cellules sources et les chemins CV / lettre</summary><dl className="max-h-72 space-y-2 overflow-auto break-words">{Object.entries(row.raw).map(([key, value]) => <div key={key}><dt className="font-medium">{key}</dt><dd className="whitespace-pre-wrap text-muted">{value || '—'}</dd></div>)}</dl></details>
        </article>
      })}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Button type="submit" className="app-button" disabled={busy || page === 0} onClick={() => setPage((value) => value - 1)}>Page précédente</Button>
        <span>Page {page + 1} / {Math.max(1, Math.ceil(preview.rows.length / pageSize))}</span>
        <Button type="submit" className="app-button" disabled={busy || (page + 1) * pageSize >= preview.rows.length} onClick={() => setPage((value) => value + 1)}>Page suivante</Button>
      </div>
      <Button type="submit" className="app-button mt-4" disabled={busy || !validSelection} onClick={() => setConfirming(true)}>Vérifier et importer {selectedRows.length} ligne(s)</Button>
    </>}
    {confirming && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"><div ref={modal} role="dialog" aria-modal="true" aria-label="Confirmer l’import CSV" className="app-modal max-w-lg">
      <p>Importer {selectedRows.length} ligne(s) de {source?.name} ? Les dossiers rapprochés seront placés sous l’autorité du CSV et leurs champs sources seront remplacés après sauvegarde chiffrée vérifiée.</p>
      <p className="mt-3 text-sm text-muted">Le fichier CSV original ne sera pas modifié. Aucune ligne non sélectionnée ne sera supprimée.</p>
      <div className="mt-4 flex justify-end gap-3"><Button type="submit" className="app-button" disabled={busy} onClick={() => setConfirming(false)}>Annuler</Button><Button type="submit" className="app-button" disabled={busy || !validSelection} onClick={() => void run(async () => {
        if (!source || !preview) return
        const saved = await importRegister(source.csv, source.name, preview.revision, resolutions)
        setSource(null); setPreview(null); setSelected({}); setConfirming(false)
        setSuccess(`${saved.imported} ligne(s) importée(s). Sauvegarde chiffrée préalable vérifiée.`)
      })}>Confirmer l’import</Button></div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    </div></div>}
  </section>
}

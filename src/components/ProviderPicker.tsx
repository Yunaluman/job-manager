import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useSettings, useSettingsError, saveSettings, saveCredential, PROVIDER_PRESETS, hasApiKey, providerId } from '../cv'
import { DraftGuard } from './DraftGuard'

const inputClass =
  'app-field'

// Sélecteur fournisseur + modèle, partagé entre les pages (réglage global).
// withKeys : affiche aussi la saisie/suppression de la clé du fournisseur courant.
export function ProviderPicker({ withKeys = false }: { withKeys?: boolean }) {
  const settings = useSettings()
  const loadingError = useSettingsError()
  const [keyInput, setKeyInput] = useState('')
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const key = hasApiKey(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const provider = providerId(settings)


  async function changeCredential(remove = false) {
    if (busy || (!remove && !keyInput.trim())) return
    setBusy(true)
    setError('')
    try {
      await saveCredential(provider, remove ? undefined : keyInput.trim())
      setKeyInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <DraftGuard dirty={modelDraft !== null || keyInput.length > 0} />
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} className="text-muted" /> Fournisseur IA
      </div>
      {loadingError && <p role="alert" className="mb-3 text-xs text-rose-700 dark:text-rose-400">{loadingError} Les anciennes données sont conservées ; recharge après correction.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          className={inputClass}
          value={provider}
          disabled={busy}
          onChange={(e) => {
            setKeyInput('')
            setError('')
            const preset = PROVIDER_PRESETS.find((p) => p.id === e.target.value)
            if (preset) {
              setBusy(true)
              void saveSettings({ baseUrl: preset.baseUrl, model: preset.model })
                .then(() => setModelDraft(null))
                .catch((e) => setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.'))
                .finally(() => setBusy(false))
            }
          }}
        >
          {PROVIDER_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom" disabled>
            Ancien fournisseur non autorisé
          </option>
        </select>
        <input
          className={inputClass}
          disabled={busy}
          value={modelDraft ?? settings.model}
          onChange={(e) => setModelDraft(e.target.value)}
          placeholder="Modèle (ex: glm-4.5-flash)"
        />
      </div>
      {modelDraft !== null && <button disabled={busy} className="mt-2 text-sm underline" onClick={async () => {
        setBusy(true)
        try { await saveSettings({ model: modelDraft }); setModelDraft(null); setError('') }
        catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement non confirmé.') }
        finally { setBusy(false) }
      }}>Enregistrer le modèle</button>}
      {error && !withKeys && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-400">{error}</p>}

      {withKeys ? (
        <div className="mt-3">
          {key ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <ShieldCheck size={13} /> Clé {provider} protégée sur cet appareil
              </span>
              <button
                disabled={busy}
                onClick={() => void changeCredential(true)}
                className="text-xs text-rose-700 dark:text-rose-400 hover:underline"
              >
                Effacer cette clé
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                className={inputClass}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={
                  PROVIDER_PRESETS.find((p) => p.id === provider)?.keyHint ?? 'Clé API du fournisseur'
                }
              />
              <button
                disabled={busy || !keyInput.trim() || provider === 'custom'}
                onClick={() => void changeCredential()}
                className="shrink-0 rounded-lg border border-line px-3 text-sm hover:border-slate-500"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Les clés enregistrées sont chiffrées pour ton compte Windows. Les appels passent par le
            serveur local vers Mistral ou Z.ai ; le navigateur ne récupère pas les clés enregistrées.
            Le CV et le texte de l'offre sont transmis au fournisseur choisi lors d'un appel IA.
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-400">{error}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted">
          {key ? (
            <>Clé {provider} disponible sur le serveur local.</>
          ) : (
            <>
              Pas de clé pour ce fournisseur —{' '}
              <Link to="/parametres" className="text-indigo-700 dark:text-indigo-400 hover:underline">
                l'enregistrer dans les Paramètres
              </Link>
              , ou utilise le mode copier-coller.
            </>
          )}
        </p>
      )}
    </section>
  )
}

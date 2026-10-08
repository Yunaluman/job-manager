import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useSettings, useSettingsError, saveSettings, saveCredential, PROVIDER_PRESETS, hasApiKey, providerId } from '../cv'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

// Sélecteur fournisseur + modèle, partagé entre les pages (réglage global).
// withKeys : affiche aussi la saisie/suppression de la clé du fournisseur courant.
export function ProviderPicker({ withKeys = false }: { withKeys?: boolean }) {
  const settings = useSettings()
  const loadingError = useSettingsError()
  const [keyInput, setKeyInput] = useState('')
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
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} className="text-slate-400" /> Fournisseur IA
      </div>
      {loadingError && <p role="alert" className="mb-3 text-xs text-rose-400">{loadingError} Les anciennes données sont conservées ; recharge après correction.</p>}
      <div className="grid grid-cols-2 gap-2">
        <select
          className={inputClass}
          value={provider}
          disabled={busy}
          onChange={(e) => {
            setKeyInput('')
            setError('')
            const preset = PROVIDER_PRESETS.find((p) => p.id === e.target.value)
            if (preset) saveSettings({ baseUrl: preset.baseUrl, model: preset.model })
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
          value={settings.model}
          onChange={(e) => saveSettings({ model: e.target.value })}
          placeholder="Modèle (ex: glm-4.5-flash)"
        />
      </div>

      {withKeys ? (
        <div className="mt-3">
          {key ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <ShieldCheck size={13} /> Clé {provider} protégée sur cet appareil
              </span>
              <button
                disabled={busy}
                onClick={() => void changeCredential(true)}
                className="text-xs text-rose-400 hover:underline"
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
                className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm hover:border-slate-500"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Les clés enregistrées sont chiffrées pour ton compte Windows. Les appels passent par le
            serveur local vers Mistral ou Z.ai ; le navigateur ne récupère pas les clés enregistrées.
            Le CV et le texte de l'offre sont transmis au fournisseur choisi lors d'un appel IA.
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">
          {key ? (
            <>Clé {provider} disponible sur le serveur local.</>
          ) : (
            <>
              Pas de clé pour ce fournisseur —{' '}
              <Link to="/parametres" className="text-indigo-400 hover:underline">
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

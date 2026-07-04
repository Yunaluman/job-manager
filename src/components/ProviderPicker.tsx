import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useSettings, saveSettings, PROVIDER_PRESETS, activeKey, providerId } from '../cv'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

// Sélecteur fournisseur + modèle, partagé entre les pages (réglage global).
// withKeys : affiche aussi la saisie/suppression de la clé du fournisseur courant.
export function ProviderPicker({ withKeys = false }: { withKeys?: boolean }) {
  const settings = useSettings()
  const [keyInput, setKeyInput] = useState('')
  const key = activeKey(settings)
  const provider = providerId(settings)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} className="text-slate-400" /> Fournisseur IA
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className={inputClass}
          value={provider}
          onChange={(e) => {
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
            Autre (URL personnalisée)
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
                <ShieldCheck size={13} /> Clé {provider} enregistrée (•••{key.slice(-4)})
              </span>
              <button
                onClick={() => {
                  const { [provider]: _removed, ...rest } = settings.keys
                  saveSettings({ keys: rest })
                }}
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
                onClick={() => {
                  if (keyInput.trim()) {
                    saveSettings({ keys: { ...settings.keys, [provider]: keyInput.trim() } })
                    setKeyInput('')
                  }
                }}
                className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm hover:border-slate-500"
              >
                Enregistrer
              </button>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Une clé par fournisseur, stockée uniquement sur cet appareil, envoyée exclusivement au
            fournisseur choisi ({new URL(settings.baseUrl).host}), jamais incluse dans les exports.
            Rappel : le CV envoyé contient des données personnelles — Mistral est hébergé en UE
            (RGPD), Z.ai non.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">
          {key ? (
            <>Clé {provider} active (•••{key.slice(-4)}).</>
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

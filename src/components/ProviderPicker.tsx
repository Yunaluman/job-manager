import { Link } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useSettings, saveSettings, PROVIDER_PRESETS, activeKey, providerId } from '../cv'

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

// Sélecteur fournisseur + modèle, partagé entre les pages CV et Lettre.
// Les clés (une par fournisseur) se gèrent sur la page Amélioration CV.
export function ProviderPicker() {
  const settings = useSettings()
  const key = activeKey(settings)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} className="text-slate-400" /> Fournisseur IA
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          className={inputClass}
          value={providerId(settings)}
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
      <p className="mt-2 text-[11px] text-slate-500">
        {key ? (
          <>Clé {providerId(settings)} active (•••{key.slice(-4)}).</>
        ) : (
          <>
            Pas de clé pour ce fournisseur —{' '}
            <Link to="/cv" className="text-indigo-400 hover:underline">
              l'enregistrer sur la page Amélioration CV
            </Link>
            , ou utilise le mode copier-coller.
          </>
        )}
      </p>
    </section>
  )
}

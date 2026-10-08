import { useEffect, useState } from 'react'
import { SunMoon } from 'lucide-react'

export function ThemePicker() {
  const [preference, setPreference] = useState(() => {
    try { const value = localStorage.getItem('jobpilot.theme'); return value && ['system', 'light', 'dark'].includes(value) ? value : 'system' }
    catch { return 'system' }
  })
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === 'jobpilot.theme') setPreference(event.newValue && ['system', 'light', 'dark'].includes(event.newValue) ? event.newValue : 'system')
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  return <label className="flex items-center gap-2 text-xs font-medium text-muted">
    <SunMoon size={16} aria-hidden="true" /><span className="sr-only">Thème de l’interface</span>
    <select className="rounded-lg border border-line bg-surface px-2 py-2 text-ink" value={preference} onChange={(event) => {
      const value = event.target.value
      setPreference(value)
      try { localStorage.setItem('jobpilot.theme', value) } catch {}
      document.documentElement.dataset.theme = value === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value
      document.documentElement.style.colorScheme = document.documentElement.dataset.theme
      window.dispatchEvent(new CustomEvent('jobpilot-theme-change', { detail: value }))
    }}><option value="system">Système</option><option value="light">Clair</option><option value="dark">Sombre</option></select>
  </label>
}

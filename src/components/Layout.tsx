import { DraftNavigationGuard } from './DraftGuard'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Briefcase, LayoutDashboard, KanbanSquare, FileText, Mail, Settings, User, Menu, X, Activity, ListTodo } from 'lucide-react'
import { NotificationCenter } from './NotificationCenter'
import { PersistenceBanner } from './PersistenceBanner'
import { ThemePicker } from './ThemePicker'
import { AiBudgetBanner } from './AiBudgetBanner'

const destinations = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/offres', label: 'Offres', icon: Briefcase },
  { to: '/candidatures', label: 'Candidatures', icon: KanbanSquare },
  { to: '/actions', label: 'Actions', icon: ListTodo },
  { to: '/bilan', label: 'Bilan', icon: Activity },
  { to: '/profil', label: 'Mon profil', icon: User },
  { to: '/cv', label: 'Analyse du CV', icon: FileText },
  { to: '/lettre', label: 'Textes de lettres conservés', icon: Mail },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
  { to: '/activite-ia', label: 'Activité IA', icon: Activity },
] as const
const linkClass = 'app-nav-link flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors'

export function Layout() {
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    const desktop = matchMedia('(min-width: 1024px)')
    const changed = () => { if (desktop.matches) setOpen(false) }
    desktop.addEventListener('change', changed)
    return () => desktop.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (!open) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    navigation.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus() }
      if (event.key === 'Tab') {
        const items = Array.from(navigation.current?.querySelectorAll<HTMLElement>('a, button') ?? [])
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', keydown) }
  }, [open])
  return <div className="min-h-screen lg:flex"><DraftNavigationGuard />
    <a href="#main-content" className="sr-only z-[110] rounded-lg bg-surface p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Aller au contenu</a>
    {open && <button aria-label="Fermer la navigation" className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => { setOpen(false); menuButton.current?.focus() }} />}
    <aside ref={navigation} id="main-navigation" aria-label="Navigation principale" className={`${open ? 'fixed inset-y-0 left-0 z-[60] flex' : 'hidden'} app-sidebar w-64 shrink-0 flex-col p-5 lg:sticky lg:top-0 lg:flex lg:h-screen`}>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#75d2ad] text-[#152c33]"><Briefcase size={20} /></div>
        <div><div className="text-lg font-bold tracking-tight">JobPilot<span className="text-[#75d2ad]">.</span></div><div className="text-xs text-[#89a4ae]">Un cap pour ta recherche</div></div>
        <button aria-label="Fermer le menu" className="ml-auto rounded-lg p-2 text-white/80 lg:hidden" onClick={() => { setOpen(false); menuButton.current?.focus() }}><X size={18} /></button>
      </div>
      <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] app-nav-label">Espace de travail</p>
      <nav className="flex flex-col gap-1.5">{destinations.slice(0,5).map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={() => setOpen(false)} className={linkClass} activeOptions={{ exact: to === '/' }}><Icon size={18} aria-hidden="true" />{label}</Link>)}<p className="mt-5 px-3 text-[10px] font-semibold uppercase tracking-wide app-nav-label">Profil et documents</p>{destinations.slice(5,8).map(({to,label,icon:Icon})=><Link key={to} to={to} onClick={()=>setOpen(false)} className={linkClass}><Icon size={18} aria-hidden="true" />{label}</Link>)}<p className="mt-5 px-3 text-[10px] font-semibold uppercase tracking-wide app-nav-label">Configuration</p>{destinations.slice(8).map(({to,label,icon:Icon})=><Link key={to} to={to} onClick={()=>setOpen(false)} className={linkClass}><Icon size={18} aria-hidden="true" />{label}</Link>)}</nav>
      <div className="mt-auto pt-8"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold text-white">Un suivi, à ton rythme</p><p className="mt-1 text-xs leading-relaxed text-[#89a4ae]">Candidatures et brouillons réunis sur cet appareil.</p></div></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="app-topbar flex min-h-18 items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3"><button ref={menuButton} aria-label="Ouvrir la navigation" aria-expanded={open} aria-controls="main-navigation" className="app-button px-2 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button><span className="hidden text-xs font-medium text-muted sm:block">Recherche d’emploi <span className="mx-2 text-line">/</span><span className="text-secondary">{destinations.find((item) => item.to === pathname)?.label ?? 'Dossier candidature'}</span></span><span className="font-semibold sm:hidden">JobPilot.</span></div>
        <div className="flex shrink-0 items-center gap-2"><NotificationCenter /><ThemePicker /></div>
      </header>
      <main id="main-content" tabIndex={-1} className="app-content min-w-0 px-4 py-6 sm:px-6 lg:p-8 xl:p-10"><PersistenceBanner /><AiBudgetBanner /><div className="app-page"><Outlet /></div><footer className="mx-auto mt-12 max-w-6xl border-t border-line pt-4 text-xs text-muted">JobPilot · Suivi personnel</footer></main>
    </div>
  </div>
}

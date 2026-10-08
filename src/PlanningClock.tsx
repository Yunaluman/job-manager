import { createContext, useContext, useEffect, useState } from 'react'
import { parisDay } from './actions-core.mjs'

const DayContext = createContext(parisDay())
export const usePlanningDay = () => useContext(DayContext)
export function PlanningClock({ children }: { children: React.ReactNode }) {
  const [day, setDay] = useState(parisDay)
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setDay(parisDay()) }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return <DayContext.Provider value={day}>{children}</DayContext.Provider>
}

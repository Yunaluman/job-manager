import { useSyncExternalStore } from 'react'
import type { Application } from './types'
import type { Settings, CvAnalysis } from './cv'
import { apiGet, apiWrite, refreshSession } from './api'
import { createConfirmedStore } from './persistence-core.mjs'
import { migrateLegacyList } from './legacy-migration.mjs'
import type { AiConfig } from './ai-monitoring'

export interface DataState {
  revision: number
  applications: Application[]
  analyses: CvAnalysis[]
  settings: Settings
  aiConfig: AiConfig
}
const initialState: DataState = {
  revision: 0, applications: [], analyses: [],
  aiConfig: { monthlyLimitCents: null, tariffs: [] },
  settings: { keyStatus: {}, baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', cvText: '', profileName: '', profileEmail: '', profilePhone: '', profileCity: '', profileTitle: '' },
}
export const dataStore = createConfirmedStore<DataState>({
  initialState,
  load: async () => {
    await refreshSession()
    const loaded = await apiGet<DataState>('state')
    if (!loaded.aiConfig || !Array.isArray(loaded.aiConfig.tariffs) || (loaded.aiConfig.monthlyLimitCents !== null && (!Number.isSafeInteger(loaded.aiConfig.monthlyLimitCents) || loaded.aiConfig.monthlyLimitCents < 0))) throw new Error('Configuration IA absente ou invalide. Redémarre JobPilot puis synchronise.')
    return { ...loaded, settings: { ...initialState.settings, ...loaded.settings } }
  },
  persist: (operation, revision) => apiWrite(operation.method, operation.path, operation.body, revision),
})
export const useData = () => useSyncExternalStore(dataStore.subscribe, dataStore.getState)
export const usePersistenceStatus = () => useSyncExternalStore(dataStore.subscribe, dataStore.getStatus)
export const synchronize = () => initialize()
export const getSettings = () => dataStore.getState().settings

async function initialize() {
  try {
  await dataStore.refresh()
  for (const [key, path] of [['jobpilot.applications.v1', 'applications'], ['jobpilot.cv-analyses.v1', 'analyses']] as const) {
    const target = path === 'applications' ? 'applications' : 'analyses'
    await migrateLegacyList({ storage: localStorage, key, current: dataStore.getState()[target],
      save: (old) => dataStore.mutate((state) => ({ method: 'PUT', path, body: old, apply: (_previous, result) => ({ ...state, [target]: result }) })) })
  }
  const legacySettings = localStorage.getItem('jobpilot.settings.v1')
  if (legacySettings) {
    await dataStore.mutate<Settings>(() => ({ method: 'POST', path: 'settings/migrate', body: JSON.parse(legacySettings), apply: (state, settings) => ({ ...state, settings: { ...state.settings, ...settings } }) }))
    if (localStorage.getItem('jobpilot.settings.v1') !== legacySettings) throw new Error('Ancien profil modifié pendant la migration ; source conservée.')
    localStorage.removeItem('jobpilot.settings.v1')
  }
  initializationError = ''
  } catch (error) {
    initializationError = error instanceof Error ? error.message : 'Initialisation impossible.'
    dataStore.block(initializationError)
    throw error
  } finally { initializationListeners.forEach((listener) => listener()) }
}
// A visible error remains available for explicit reconciliation; no endless retry loop.
let initializationError = ''
const initializationListeners = new Set<() => void>()
void initialize().catch(() => { console.error('JobPilot initialization was not confirmed.') })
export const useInitializationError = () => useSyncExternalStore(
  (listener) => { initializationListeners.add(listener); return () => initializationListeners.delete(listener) },
  () => initializationError,
)

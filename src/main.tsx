import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
} from '@tanstack/react-router'
import './index.css'
import { Layout } from './components/Layout'
import { Dashboard } from './features/dashboard/Dashboard'
import { Applications } from './features/applications/Applications'
import { ApplicationDetail } from './features/applications/ApplicationDetail'
import { CvPage } from './features/documents/CvPage'
import { LetterPage } from './features/documents/LetterPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { ProfilePage } from './features/documents/ProfilePage'
import { AiActivityPage } from './features/activity/AiActivityPage'
import { ActionsPage } from './features/planning/ActionsPage'
import { PlanningClock } from './PlanningClock'
import { OffersPage } from './features/offers/OffersPage'
import { StrategyReviewPage } from './features/dashboard/StrategyReviewPage'

const rootRoute = createRootRoute({ component: Layout })

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

const applicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/candidatures',
  component: Applications,
})

const applicationDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/candidatures/$id',
  component: ApplicationDetail,
  validateSearch: (search: Record<string, unknown>) => ({ tab: ['summary','offer','documents','history'].includes(String(search.tab)) ? String(search.tab) : undefined }),
})

const cvRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cv',
  component: CvPage,
})

const letterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lettre',
  component: LetterPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parametres',
  component: SettingsPage,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profil',
  component: ProfilePage,
})

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/bilan', component: StrategyReviewPage, validateSearch: (search: Record<string, unknown>) => ({ from: typeof search.from === 'string' ? search.from : undefined, to: typeof search.to === 'string' ? search.to : undefined }) }),
  createRoute({ getParentRoute: () => rootRoute, path: '/offres', component: OffersPage, validateSearch: (search: Record<string, unknown>) => ({ offer: typeof search.offer === 'string' ? search.offer : undefined }) }),
  createRoute({ getParentRoute: () => rootRoute, path: '/actions', component: ActionsPage, validateSearch: (search: Record<string, unknown>) => ({ action: typeof search.action === 'string' ? search.action : undefined, app: typeof search.app==='string'?search.app:undefined, interview: typeof search.interview === 'string' ? search.interview : undefined }) }),
  createRoute({ getParentRoute: () => rootRoute, path: '/activite-ia', component: AiActivityPage }),
  dashboardRoute,
  applicationsRoute,
  applicationDetailRoute,
  cvRoute,
  letterRoute,
  settingsRoute,
  profileRoute,
])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlanningClock><RouterProvider router={router} /></PlanningClock>
  </React.StrictMode>,
)

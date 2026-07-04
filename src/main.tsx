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
import { Dashboard } from './pages/Dashboard'
import { Applications } from './pages/Applications'
import { ApplicationDetail } from './pages/ApplicationDetail'
import { CvPage } from './pages/CvPage'
import { LetterPage } from './pages/LetterPage'
import { SettingsPage } from './pages/SettingsPage'
import { ProfilePage } from './pages/ProfilePage'

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
    <RouterProvider router={router} />
  </React.StrictMode>,
)

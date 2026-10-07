// Client HTTP minimal vers le serveur local SQLite (server/index.mjs).
// Les mutations sont optimistes : le cache mémoire est mis à jour tout de
// suite, l'écriture part en tâche de fond ; en cas d'échec on prévient.

let warned = false

export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="jobpilot-session"]')?.content
  if (!token) throw new Error('Session locale absente. Démarre JobPilot puis recharge la page.')
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'X-JobPilot-Session': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
  })
  const data = await res.json()
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Opération locale impossible.')
  return data as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>('GET', path)
}

export function apiSend(method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  apiRequest(method, path, body)
    .catch(() => {
      if (!warned) {
        warned = true
        alert('Sauvegarde impossible — le serveur local est-il lancé ? (pnpm dev)')
      }
    })
}

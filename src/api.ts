// Client HTTP minimal vers le serveur local SQLite (server/index.mjs).
// Les mutations sont optimistes : le cache mémoire est mis à jour tout de
// suite, l'écriture part en tâche de fond ; en cas d'échec on prévient.

let warned = false

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

export function apiSend(method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  fetch(`/api/${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status))
    })
    .catch(() => {
      if (!warned) {
        warned = true
        alert('Sauvegarde impossible — le serveur local est-il lancé ? (pnpm dev)')
      }
    })
}

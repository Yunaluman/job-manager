// Transport errors cannot establish whether a write committed. Never retry them automatically.
export class PersistenceError extends Error {
  constructor(message: string, public outcome: 'rejected' | 'unknown' | 'conflict') { super(message) }
}

export async function apiRequest<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const token = document.querySelector<HTMLMetaElement>('meta[name="jobpilot-session"]')?.content
  if (!token) throw new Error('Session locale absente. Démarre JobPilot puis recharge la page.')
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
    method,
    headers: { 'X-JobPilot-Session': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
    })
  } catch { throw new PersistenceError('Réponse absente ; une écriture a peut-être été enregistrée. Synchronise avant de réessayer.', 'unknown') }
  let data: Record<string, unknown>
  try { data = await res.json() }
  catch { throw new PersistenceError('Réponse illisible ; aucune confirmation fiable. Synchronise les données.', 'unknown') }
  if (!res.ok) throw new PersistenceError(typeof data.error === 'string' ? data.error : 'Opération locale impossible.', res.status === 409 ? 'conflict' : res.status >= 500 ? 'unknown' : 'rejected')
  return data as T
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>('GET', path)
}

export function apiWrite<T>(method: 'PUT' | 'DELETE' | 'POST', path: string, body: unknown, revision: number) {
  return apiRequest<{ ok: boolean; revision: number; result: T }>(method, path, body, {
    'X-JobPilot-Revision': String(revision),
    'X-JobPilot-Operation': crypto.randomUUID(),
  })
}

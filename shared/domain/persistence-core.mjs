// Confirmed state changes only after a validated acknowledgement. No automatic write retries.
export function createConfirmedStore({ initialState, load, persist }) {
  let state = initialState
  let status = { ready: false, pending: 0, blocked: false, error: '', lastConfirmedAt: null }
  let tail = Promise.resolve()
  const listeners = new Set()
  const notify = () => listeners.forEach((listener) => listener())
  const publishStatus = (patch) => { status = { ...status, ...patch }; notify() }
  function enqueue(task) {
    publishStatus({ pending: status.pending + 1 })
    const result = tail.then(task)
    tail = result.catch(() => {})
    return result.finally(() => publishStatus({ pending: status.pending - 1 }))
  }
  return {
    getState: () => state,
    getStatus: () => status,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    block(error) { publishStatus({ blocked: true, error }) },
    refresh() {
      return enqueue(async () => {
        try {
          const loaded = await load()
          if (!Number.isSafeInteger(loaded.revision) || !Array.isArray(loaded.applications) || !Array.isArray(loaded.analyses) || !loaded.settings) throw new Error('État du serveur invalide.')
          state = loaded
          publishStatus({ ready: true, blocked: false, error: '' })
        } catch (error) {
          publishStatus({ blocked: true, error: error.message || 'Synchronisation impossible.' })
          throw error
        }
      })
    },
    mutate(build) {
      return enqueue(async () => {
        if (!status.ready || status.blocked) {
          const error = new Error('Synchronise les données avant toute nouvelle écriture.')
          publishStatus({ error: error.message })
          throw error
        }
        let confirmed = false
        try {
          const operation = build(state)
          const ack = await persist(operation, state.revision)
          if (ack.ok !== true || ack.revision !== state.revision + 1) {
            const error = new Error('Confirmation invalide ; le résultat de l’écriture est incertain. Synchronise les données.')
            error.outcome = 'unknown'
            throw error
          }
          confirmed = true
          state = { ...operation.apply(state, ack.result), revision: ack.revision }
          publishStatus({ error: '', lastConfirmedAt: new Date().toISOString() })
          return ack.result
        } catch (error) {
          publishStatus({ blocked: confirmed || error.outcome === 'unknown' || error.outcome === 'conflict', error: error.message || 'Écriture non confirmée.' })
          throw error
        }
      })
    },
    async idle() { await tail },
  }
}

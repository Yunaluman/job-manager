export interface PersistenceStatus {
  ready: boolean
  pending: number
  blocked: boolean
  error: string
  lastConfirmedAt: string | null
}
export interface Operation<State, Result = unknown> {
  method: 'PUT' | 'DELETE' | 'POST'
  path: string
  body?: unknown
  apply(state: State, result: Result): State
}
export function createConfirmedStore<State extends { revision: number; applications: unknown[]; analyses: unknown[]; settings: object }>(options: {
  initialState: State
  load(): Promise<State>
  persist(operation: Operation<State>, revision: number): Promise<{ ok: boolean; revision: number; result: unknown }>
}): {
  getState(): State
  getStatus(): PersistenceStatus
  subscribe(listener: () => void): () => void
  block(error: string): void
  refresh(): Promise<void>
  mutate<Result>(build: (state: State) => Operation<State, Result>): Promise<Result>
  idle(): Promise<void>
}

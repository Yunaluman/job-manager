export function migrateLegacyList(options: {
  storage: Pick<Storage, 'getItem' | 'removeItem'>
  key: string
  current: unknown[]
  save(rows: unknown[]): Promise<unknown>
}): Promise<void>

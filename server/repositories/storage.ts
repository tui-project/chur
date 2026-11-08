import { getDatabase } from './database.ts'
import { backup, DatabaseSync } from 'node:sqlite'

export const storageRepository = {
  check() { getDatabase().prepare('SELECT 1').get() },
  snapshot: (target: string) => backup(getDatabase(), target),
}
export type StorageRepository = typeof storageRepository

export function verifyDatabase(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (result.integrity_check !== 'ok') throw new Error('Backup integrity check failed.')
  } finally { db.close() }
}

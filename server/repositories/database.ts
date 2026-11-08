import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { migrations } from './migrations.ts'

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE')

  try {
    const value = work()
    db.exec('COMMIT')

    return value

  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  const path = join(dataDir, 'chur.sqlite')
  const db = new DatabaseSync(path)

  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
    chmodSync(path, 0o600)

    transaction(db, () => {
      db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL) STRICT')

      const applied = db.prepare('SELECT id, checksum FROM schema_migrations ORDER BY id').all() as { id: number; checksum: string }[]

      if (applied.some(row => !migrations.some(m => m.id === row.id))) {
        throw new Error('Database schema is newer than this application.')
      }

      for (const migration of migrations) {
        const checksum = createHash('sha256').update(migration.sql).digest('hex')
        const previous = applied.find(row => row.id === migration.id)

        if (previous && previous.checksum !== checksum) {
          throw new Error('Applied migration checksum mismatch.')
        }

        if (!previous) {
          db.exec(migration.sql)
          db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(migration.id, checksum, Date.now())
        }
      }
    })

    return db

  } catch (error) {
    db.close()
    throw error
  }
}

let database: DatabaseSync | undefined

export function initDatabase(dataDir: string): void {
  if (database) throw new Error('Database is already initialised.')
  // Publish the connection only after migrations have completed successfully.
  database = openDatabase(dataDir)
}

export function getDatabase(): DatabaseSync {
  if (!database) throw new Error('Database is not initialised.')
  return database
}

export function closeDatabase(): void {
  if (!database) return
  database.close()
  database = undefined
}

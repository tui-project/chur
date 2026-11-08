import { getDatabase } from './database.ts'

export const credentialRepository = {
  hasCredentials: () => Number(getDatabase().prepare('SELECT count(*) AS n FROM credentials').get()?.n) > 0,
  set(name: string, encrypted: string, now: number) {
    getDatabase().prepare('INSERT INTO credentials VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET encrypted_value=excluded.encrypted_value, updated_at=excluded.updated_at').run(name, encrypted, now)
  },
  get(name: string): string | undefined {
    return (getDatabase().prepare('SELECT encrypted_value FROM credentials WHERE name=?').get(name) as { encrypted_value: string } | undefined)?.encrypted_value
  },
}
export type CredentialRepository = typeof credentialRepository

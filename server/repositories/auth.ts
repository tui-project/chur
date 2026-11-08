import { getDatabase, transaction } from './database.ts'

export const authRepository = {
  hasAdmin: () => !!getDatabase().prepare('SELECT id FROM admin LIMIT 1').get(),
  findAdmin: () => getDatabase().prepare('SELECT username,password_hash FROM admin WHERE id=1').get() as { username: string; password_hash: string } | undefined,
  createAdmin: (username: string, hash: string, now: number) => getDatabase().prepare('INSERT INTO admin VALUES (1,?,?,?) ON CONFLICT(id) DO NOTHING').run(username, hash, now).changes !== 0,
  findLimit: (bucket: string) => getDatabase().prepare('SELECT failures,reset_at FROM auth_limits WHERE bucket=?').get(bucket) as { failures: number; reset_at: number } | undefined,
  recordFailure(bucket: string, now: number, resetAt: number) {
    getDatabase().prepare(`INSERT INTO auth_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET
      failures=CASE WHEN reset_at<=? THEN 1 ELSE failures+1 END,
      reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`).run(bucket, resetAt, now, now)
  },
  clearLimit: (bucket: string) => { getDatabase().prepare('DELETE FROM auth_limits WHERE bucket=?').run(bucket) },
  createSession(hash: string, expiresAt: number, now: number) {
    transaction(getDatabase(), () => {
      getDatabase().prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
      getDatabase().prepare('DELETE FROM auth_limits WHERE reset_at<=?').run(now)
      getDatabase().prepare('INSERT INTO sessions VALUES (?,1,?)').run(hash, expiresAt)
    })
  },
  findSession: (hash: string, now: number) => getDatabase().prepare('SELECT admin.username FROM sessions JOIN admin ON admin.id=sessions.admin_id WHERE token_hash=? AND expires_at>?').get(hash, now) as { username: string } | undefined,
  deleteSession: (hash: string) => { getDatabase().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash) },
}
export type AuthRepository = typeof authRepository

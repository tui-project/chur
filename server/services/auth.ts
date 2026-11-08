import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { authRepository as repository } from '../repositories/auth.ts'

export const SESSION_SECONDS = 7 * 24 * 60 * 60
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))
})
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt-v1.${salt.toString('hex')}.${(await derive(password, salt)).toString('hex')}`
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, expected] = encoded.split('.')
  if (version !== 'scrypt-v1' || !salt || !expected) return false
  return equal((await derive(password, Buffer.from(salt, 'hex'))).toString('hex'), expected)
}

function bucket(action: string, client: string) { return digest(`${action}:${client}`) }

function failed(action: string, client: string, now: number) {
  repository.recordFailure(bucket(action, client), now, now + 15 * 60_000)
}
function createSession(now: number): string {
  const token = randomBytes(32).toString('base64url')
  repository.createSession(digest(token), now + SESSION_SECONDS * 1000, now)
  return token
}

async function login(username: string, password: string, client: string, now = Date.now()): Promise<string> {
  guard('login', client, now)
  const admin = repository.findAdmin()
  const valid = admin ? await verifyPassword(password, admin.password_hash) : false
  if (!admin || !valid || admin.username !== username) {
    failed('login', client, now)
    throw new AuthError(401, 'Invalid username or password.')
  }
  repository.clearLimit(bucket('login', client))
  return createSession(now)
}

function session(token: string | undefined, now = Date.now()): { username: string } | undefined {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return
  const row = repository.findSession(digest(token), now)
  return row
}

function logout(token: string | undefined) {
  if (token) repository.deleteSession(digest(token))
}

export function createAuthService(setupToken: string) {
  return {
    needsSetup: () => needsSetup(),
    setup: (username: string, password: string, token: string, client: string, now = Date.now()) => setup(setupToken, username, password, token, client, now),
    login: (username: string, password: string, client: string, now = Date.now()) => login(username, password, client, now),
    session: (token: string | undefined, now = Date.now()) => session(token, now),
    logout: (token: string | undefined) => logout(token),
  }
}

function needsSetup(): boolean {
  return !repository.hasAdmin()
}

async function setup(setupToken: string, username: string, password: string, token: string, client: string, now = Date.now()): Promise<string> {
  if (!needsSetup()) {
    throw new AuthError(409, 'An administrator already exists.')
  }

  guard('setup', client, now)

  if (!equal(token, setupToken)) {
    failed('setup', client, now)
    throw new AuthError(401, 'Invalid setup token.')
  }
  const hash = await hashPassword(password)
  // A fixed primary key makes concurrent setup attempts unable to create two admins.
  const result = repository.createAdmin(username, hash, now)
  if (!result) throw new AuthError(409, 'An administrator already exists.')
  return createSession(now)
}

function guard(action: string, client: string, now: number) {
  const limit = repository.findLimit(bucket(action, client))

  if (limit && limit.reset_at > now && limit.failures >= 10) {
    throw new AuthError(429, 'Too many attempts. Try again later.')
  }
}

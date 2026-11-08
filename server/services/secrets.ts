import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { credentialRepository } from '../repositories/credentials.ts'

export function privateFile(path: string, makeValue: () => Buffer): Buffer {
  try { writeFileSync(path, makeValue(), { flag: 'wx', mode: 0o600 }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  chmodSync(path, 0o600)
  return readFileSync(path)
}

export function loadMasterKey(dataDir: string): Buffer {
  const key = privateFile(join(dataDir, 'master.key'), () => randomBytes(32))
  if (key.length !== 32) throw new Error('Invalid master key. Restore the matching key from backup.')
  return key
}

export class CredentialVault {
  private key: Buffer
  constructor(key: Buffer) { this.key = key }

  set(name: string, value: string) {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce)
    cipher.setAAD(Buffer.from(name))
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const record = [nonce, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.')
    credentialRepository.set(name, record, Date.now())
  }

  get(name: string): string | undefined {
    const record = credentialRepository.get(name)
    if (record === undefined) return
    const [nonce, tag, data] = record.split('.').map(v => Buffer.from(v, 'base64'))
    if (!nonce || !tag || !data) throw new Error('Invalid encrypted credential.')
    const decipher = createDecipheriv('aes-256-gcm', this.key, nonce)
    decipher.setAAD(Buffer.from(name))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  }
}

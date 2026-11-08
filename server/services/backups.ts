import { verifyDatabase, storageRepository } from '../repositories/storage.ts'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppConfig } from './config.ts'

const checksum = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')

export async function createBackup(config: Pick<AppConfig, 'dataDir'>) {
  const id = randomUUID()
  const root = join(config.dataDir, 'backups')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const dir = join(root, id)
  await mkdir(dir, { mode: 0o700 })
  try {
    const target = join(dir, 'chur.sqlite')
    await storageRepository.snapshot(target)
    await chmod(target, 0o600)
    await copyFile(join(config.dataDir, 'master.key'), join(dir, 'master.key'))
    await chmod(join(dir, 'master.key'), 0o600)
    const createdAt = new Date().toISOString()
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ version: 1, createdAt, database: await checksum(target), key: await checksum(join(dir, 'master.key')) }), { mode: 0o600 })
    return { id, createdAt }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

export async function restoreBackup(from: string, to: string) {
  const source = resolve(from), destination = resolve(to)
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
  if (manifest.version !== 1 || manifest.database !== await checksum(join(source, 'chur.sqlite')) || manifest.key !== await checksum(join(source, 'master.key'))) {
    throw new Error('Backup verification failed.')
  }
  if ((await readFile(join(source, 'master.key'))).length !== 32) throw new Error('Invalid backup master key.')
  verifyDatabase(join(source, 'chur.sqlite'))
  // Never overwrite an existing data directory or a running database.
  try { await mkdir(destination, { mode: 0o700 }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Restore requires a new, non-existent destination directory.')
    throw error
  }
  try {
    if ((await readdir(destination)).length) throw new Error('Restore destination is not empty.')
    for (const file of ['chur.sqlite', 'master.key']) {
      await copyFile(join(source, file), join(destination, file))
      await chmod(join(destination, file), 0o600)
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true })
    throw error
  }
}

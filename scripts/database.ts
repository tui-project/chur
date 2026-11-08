import { initDatabase, closeDatabase } from '../server/repositories/database.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { readConfig } from '../server/services/config.ts'
import { createAppServices } from '../server/services/services.ts'
import { restoreBackup } from '../server/services/backups.ts'

const { positionals, values } = parseArgs({ allowPositionals: true, options: { from: { type: 'string' }, to: { type: 'string' } } })
const command = positionals[0]
if (command === 'restore') {
  if (!values.from || !values.to) throw new Error('Use --from BACKUP_DIRECTORY --to NEW_DATA_DIRECTORY.')
  await restoreBackup(values.from, values.to)
  console.log('Backup restored. Point CHUR_DATA_DIR at the new directory before starting Chur.')
} else if (command === 'backup' || command === 'token') {
  const config = readConfig()
  initDatabase(config.dataDir)
  try {
    const services = createAppServices(config)
    try {
      if (command === 'token') {
        if (!services.auth.needsSetup()) throw new Error('Setup is already complete.')
        // Deliberate local retrieval, never included in application logs or API responses.
        console.log(readFileSync(join(config.dataDir, 'setup.token'), 'utf8').trim())
      } else {
        console.log(JSON.stringify(await services.createBackup()))
      }
    } finally { await services.close() }
  } finally { closeDatabase() }
} else { throw new Error('Choose token, backup or restore.') }

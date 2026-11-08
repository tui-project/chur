import { defineNitroPlugin } from 'nitropack/runtime'
import { initDatabase, closeDatabase } from '../repositories/database.ts'
import { readConfig } from '../services/config.ts'
import { createAppServices } from '../services/services.ts'

export default defineNitroPlugin((nitro) => {
  const config = readConfig()
  initDatabase(config.dataDir)
  try {
    const services = createAppServices(config)
    services.worker.start()
    nitro.hooks.hook('request', (event) => { event.context.services = services })
    nitro.hooks.hook('close', async () => {
      await services.close()
      closeDatabase()
    })
  } catch (error) {
    closeDatabase()
    throw error
  }
})

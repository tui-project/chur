import { servicesFor } from '../utils/services.ts'
import { createError, defineEventHandler, setResponseStatus } from 'h3'
let inProgress = false
export default defineEventHandler(async (event) => {
  if (inProgress) throw createError({ statusCode: 409, statusMessage: 'A backup is already running.' })
  inProgress = true
  try {
    const result = await servicesFor(event).createBackup()
    setResponseStatus(event, 201)
    return result
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Backup failed. Check available storage and permissions.' })
  } finally { inProgress = false }
})

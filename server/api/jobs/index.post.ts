import { servicesFor } from '../../utils/services.ts'
import { defineEventHandler, setResponseStatus } from 'h3'
import { z } from 'zod'
import { jsonBody } from '../../utils/body.ts'
const input = z.object({ kind: z.literal('system.check'), requestId: z.uuid() }).strict()
export default defineEventHandler(async (event) => {
  const body = await jsonBody(event, input)
  const id = servicesFor(event).jobs.enqueue(body.kind, {}, { dedupeKey: body.requestId, retrySafe: true })
  setResponseStatus(event, 202)
  return { id }
})

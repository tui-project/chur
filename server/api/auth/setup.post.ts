import { servicesFor } from '../../utils/services.ts'
import { defineEventHandler, getRequestIP } from 'h3'
import { z } from 'zod'
import { jsonBody } from '../../utils/body.ts'
import { authError, sessionCookie } from '../../utils/auth.ts'

const input = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(12).max(256), token: z.string().min(1).max(256) }).strict()
export default defineEventHandler(async (event) => {
  const body = await jsonBody(event, input)
  try {
    const token = await servicesFor(event).auth.setup(body.username, body.password, body.token, getRequestIP(event) ?? 'unknown')
    sessionCookie(event, token)
    return { ok: true }
  } catch (error) { authError(error) }
})

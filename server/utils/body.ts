import { createError, getHeader, type H3Event } from 'h3'
import type { ZodType } from 'zod'

export async function jsonBody<T>(event: H3Event, schema: ZodType<T>): Promise<T> {
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) throw createError({ statusCode: 415, statusMessage: 'Use a JSON request.' })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 16_384) throw createError({ statusCode: 413, statusMessage: 'Request is too large.' })
    chunks.push(buffer)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON request.' })
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request. Check the entered values.' })
  return parsed.data
}

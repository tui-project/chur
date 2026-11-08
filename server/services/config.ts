import { resolve } from 'node:path'
import { z } from 'zod'

export interface AppConfig {
  dataDir: string
  secureCookies: boolean
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const schema = z.object({
    CHUR_DATA_DIR: z.string().min(1).default('data'),
    CHUR_SECURE_COOKIES: z.enum(['true', 'false']).optional(),
  })

  const parsed = schema.safeParse(env)

  if (!parsed.success) {
    throw new Error('Invalid Chur configuration. Check data directory and cookie settings.')
  }

  return {
    dataDir: resolve(parsed.data.CHUR_DATA_DIR),
    secureCookies: parsed.data.CHUR_SECURE_COOKIES === undefined ? env.NODE_ENV === 'production' : parsed.data.CHUR_SECURE_COOKIES === 'true',
  }
}

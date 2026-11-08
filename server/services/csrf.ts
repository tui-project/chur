import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function createCsrfService(masterKey: Buffer) {
  const key = createHmac('sha256', masterKey).update('chur:csrf:v1').digest()

  function issue(session = ''): string {
    const nonce = randomBytes(32).toString('base64url')
    return `${nonce}.${signature(nonce, session)}`
  }

  function valid(token: string | undefined, session = ''): token is string {
    if (!token || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token)) {
      return false
    } else {
      const [nonce, suppliedSignature] = token.split('.')
      const expected = signature(nonce!, session)
      return timingSafeEqual(Buffer.from(suppliedSignature!), Buffer.from(expected))
    }
  }

  function signature(nonce: string, session: string): string {
    return createHmac('sha256', key).update(JSON.stringify([nonce, session])).digest('base64url')
  }

  return {
    issue,
    valid
  }
}

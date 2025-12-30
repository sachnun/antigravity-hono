import { getAllTokens, getTokenWithAutoWait, markRateLimited } from '../services/tokens'
import { parseRateLimitDelay } from './rate-limit'
import { DEFAULT_RATE_LIMIT_DELAY_MS } from '../constants'

export interface TokenInfo {
  accessToken: string
  projectId: string
  email: string
}

export type RequestHandler<T> = (token: TokenInfo) => Promise<T | Response>

export interface TokenRotationOptions {
  model: string
  formatRateLimitError: (triedCount: number) => Response
  formatNoTokenError: () => Response
  formatAllExhaustedError: () => Response
}

export async function withTokenRotation<T>(
  db: D1Database,
  options: TokenRotationOptions,
  handler: RequestHandler<T>
): Promise<T | Response> {
  const allTokens = await getAllTokens(db)
  if (allTokens.length === 0) {
    return options.formatNoTokenError()
  }

  const triedEmails: string[] = []
  let lastError: Error | null = null

  for (let attempt = 0; attempt < allTokens.length; attempt++) {
    const stored = await getTokenWithAutoWait(db, options.model, triedEmails)
    if (!stored) {
      if (triedEmails.length > 0) {
        return options.formatRateLimitError(triedEmails.length)
      }
      return options.formatRateLimitError(0)
    }

    const { accessToken, projectId, email } = stored
    if (!triedEmails.includes(email)) {
      triedEmails.push(email)
    }

    try {
      const result = await handler({ accessToken, projectId, email })
      
      if (result instanceof Response) {
        if (result.status === 429) {
          const errorText = await result.clone().text()
          const delayMs = parseRateLimitDelay(errorText) ?? DEFAULT_RATE_LIMIT_DELAY_MS
          await markRateLimited(db, email, options.model, delayMs)
          continue
        }
        return result
      }
      
      return result
    } catch (e) {
      if (e instanceof Error && e.message.includes('429')) {
        await markRateLimited(db, email, options.model, DEFAULT_RATE_LIMIT_DELAY_MS)
        lastError = e
        continue
      }
      throw e
    }
  }

  if (lastError) throw lastError
  return options.formatAllExhaustedError()
}

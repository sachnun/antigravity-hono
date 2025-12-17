import { refreshAccessToken } from './oauth'

export interface StoredToken {
  accessToken: string
  refreshToken: string
  projectId: string
  expiresAt: number
  email: string
  rateLimitUntil?: {
    gemini?: number
    claude?: number
  }
  lastUsed?: number
}

export type ModelFamily = 'gemini' | 'claude'

const TOKENS_KEY = 'tokens'

export async function getAllTokens(kv: KVNamespace): Promise<StoredToken[]> {
  const data = await kv.get(TOKENS_KEY, 'json')
  return (data as StoredToken[]) ?? []
}

export async function setAllTokens(kv: KVNamespace, tokens: StoredToken[]): Promise<void> {
  await kv.put(TOKENS_KEY, JSON.stringify(tokens))
}

function getModelFamily(model: string): ModelFamily {
  return model.includes('claude') ? 'claude' : 'gemini'
}

function isRateLimited(token: StoredToken, family: ModelFamily): boolean {
  const resetTime = token.rateLimitUntil?.[family]
  return resetTime !== undefined && Date.now() < resetTime
}

function clearExpiredRateLimits(token: StoredToken): void {
  const now = Date.now()
  if (token.rateLimitUntil) {
    if (token.rateLimitUntil.gemini && now >= token.rateLimitUntil.gemini) {
      delete token.rateLimitUntil.gemini
    }
    if (token.rateLimitUntil.claude && now >= token.rateLimitUntil.claude) {
      delete token.rateLimitUntil.claude
    }
  }
}

export async function getTokenForModel(kv: KVNamespace, model: string): Promise<StoredToken | null> {
  const tokens = await getAllTokens(kv)
  if (tokens.length === 0) return null

  const family = getModelFamily(model)
  
  tokens.forEach(clearExpiredRateLimits)
  
  const available = tokens.filter(t => !isRateLimited(t, family))
  
  if (available.length === 0) {
    return tokens[Math.floor(Math.random() * tokens.length)] ?? null
  }

  const selected = available[Math.floor(Math.random() * available.length)]
  
  if (selected) {
    selected.lastUsed = Date.now()
    await setAllTokens(kv, tokens)
  }

  return selected ?? null
}

export async function markRateLimited(
  kv: KVNamespace, 
  email: string, 
  model: string, 
  retryAfterMs: number
): Promise<void> {
  const tokens = await getAllTokens(kv)
  const token = tokens.find(t => t.email === email)
  
  if (token) {
    const family = getModelFamily(model)
    if (!token.rateLimitUntil) token.rateLimitUntil = {}
    token.rateLimitUntil[family] = Date.now() + retryAfterMs
    await setAllTokens(kv, tokens)
  }
}

export async function setStoredToken(kv: KVNamespace, token: StoredToken): Promise<void> {
  const tokens = await getAllTokens(kv)
  const existingIndex = tokens.findIndex(t => t.email === token.email)
  
  if (existingIndex >= 0) {
    tokens[existingIndex] = token
  } else {
    tokens.push(token)
  }
  
  await setAllTokens(kv, tokens)
}

export async function deleteStoredToken(kv: KVNamespace, email: string): Promise<void> {
  const tokens = await getAllTokens(kv)
  const filtered = tokens.filter(t => t.email !== email)
  await setAllTokens(kv, filtered)
}

export async function getValidAccessToken(
  kv: KVNamespace, 
  model: string
): Promise<{ accessToken: string; projectId: string; email: string } | null> {
  const stored = await getTokenForModel(kv, model)
  if (!stored) return null

  const bufferMs = 5 * 60 * 1000
  if (stored.expiresAt > Date.now() + bufferMs) {
    return { accessToken: stored.accessToken, projectId: stored.projectId, email: stored.email }
  }

  const refreshed = await refreshAndStore(kv, stored)
  return refreshed 
    ? { accessToken: refreshed.accessToken, projectId: refreshed.projectId, email: refreshed.email } 
    : null
}

export async function refreshAndStore(kv: KVNamespace, stored: StoredToken): Promise<StoredToken | null> {
  const result = await refreshAccessToken(stored.refreshToken)
  
  const updated: StoredToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken ?? stored.refreshToken,
    projectId: stored.projectId,
    expiresAt: result.expiresAt,
    email: stored.email,
    rateLimitUntil: stored.rateLimitUntil,
    lastUsed: stored.lastUsed,
  }
  
  await setStoredToken(kv, updated)
  return updated
}

export async function handleTokenRefresh(kv: KVNamespace): Promise<{ success: boolean; refreshed: number; errors: string[] }> {
  const tokens = await getAllTokens(kv)
  if (tokens.length === 0) {
    return { success: false, refreshed: 0, errors: ['No tokens stored'] }
  }

  let refreshed = 0
  const errors: string[] = []

  for (const token of tokens) {
    try {
      await refreshAndStore(kv, token)
      refreshed++
    } catch (e) {
      errors.push(`${token.email}: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  return { success: errors.length === 0, refreshed, errors }
}

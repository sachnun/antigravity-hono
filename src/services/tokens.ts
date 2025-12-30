import { drizzle } from 'drizzle-orm/d1'
import { eq, or, lt, isNull } from 'drizzle-orm'
import { tokens, type Token } from '../db/schema'
import { refreshAccessToken } from '../oauth'
import {
  CACHE_TTL_MS,
  MAX_AUTO_WAIT_MS,
  TOKEN_EXPIRY_BUFFER_MS,
  MAX_TOKEN_RETRY_DEPTH,
} from '../constants'

let cachedTokens: StoredToken[] | null = null
let cacheTimestamp = 0
let cachePromise: Promise<StoredToken[]> | null = null

export function invalidateCache(): void {
  cachedTokens = null
  cacheTimestamp = 0
  cachePromise = null
}

export interface StoredToken {
  accessToken: string
  refreshToken: string
  projectId: string
  expiresAt: number
  email: string
  tier?: string
  rateLimitUntil?: number
}

function tokenFromRow(row: Token): StoredToken {
  return {
    email: row.email,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    projectId: row.projectId,
    expiresAt: row.expiresAt,
    tier: row.tier ?? undefined,
    rateLimitUntil: row.rateLimitUntil ?? undefined,
  }
}

export async function getAllTokens(db: D1Database): Promise<StoredToken[]> {
  const now = Date.now()
  if (cachedTokens && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTokens
  }

  if (cachePromise) return cachePromise

  cachePromise = (async () => {
    const d1 = drizzle(db)
    const rows = await d1.select().from(tokens)
    cachedTokens = rows.map(tokenFromRow)
    cacheTimestamp = Date.now()
    cachePromise = null
    return cachedTokens
  })()

  return cachePromise
}

export async function getTokenForModel(
  db: D1Database,
  _model: string,
  excludeEmails: string[] = []
): Promise<StoredToken | null> {
  const d1 = drizzle(db)
  const now = Date.now()

  const available = await d1
    .select()
    .from(tokens)
    .where(or(isNull(tokens.rateLimitUntil), lt(tokens.rateLimitUntil, now)))

  const filteredAvailable = available.filter(t => !excludeEmails.includes(t.email))
  if (filteredAvailable.length > 0) {
    const selected = filteredAvailable[Math.floor(Math.random() * filteredAvailable.length)]
    return tokenFromRow(selected)
  }

  const all = await d1.select().from(tokens)
  const filteredAll = all.filter(t => !excludeEmails.includes(t.email))
  if (filteredAll.length === 0) return null

  const selected = filteredAll[Math.floor(Math.random() * filteredAll.length)]
  return tokenFromRow(selected)
}

export interface SmartTokenResult {
  token: StoredToken | null
  waitMs: number | null
  nearestEmail: string | null
}

export async function getSmartTokenForModel(
  db: D1Database,
  _model: string,
  excludeEmails: string[] = []
): Promise<SmartTokenResult> {
  const d1 = drizzle(db)
  const now = Date.now()

  const all = await d1.select().from(tokens)
  const filtered = all.filter(t => !excludeEmails.includes(t.email))

  if (filtered.length === 0) {
    return { token: null, waitMs: null, nearestEmail: null }
  }

  const available = filtered.filter(t => {
    const rl = t.rateLimitUntil
    return !rl || rl < now
  })

  if (available.length > 0) {
    const selected = available[Math.floor(Math.random() * available.length)]
    return { token: tokenFromRow(selected), waitMs: null, nearestEmail: null }
  }

  let nearestToken: Token | null = null
  let nearestWait = Infinity

  for (const t of filtered) {
    const rl = t.rateLimitUntil
    if (rl) {
      const wait = rl - now
      if (wait < nearestWait) {
        nearestWait = wait
        nearestToken = t
      }
    }
  }

  if (nearestToken) {
    return {
      token: null,
      waitMs: Math.max(0, nearestWait),
      nearestEmail: nearestToken.email,
    }
  }

  return { token: null, waitMs: null, nearestEmail: null }
}

export async function getTokenWithAutoWait(
  db: D1Database,
  model: string,
  excludeEmails: string[] = [],
  depth: number = 0
): Promise<{ accessToken: string; projectId: string; email: string } | null> {
  if (depth >= MAX_TOKEN_RETRY_DEPTH) return null

  const result = await getSmartTokenForModel(db, model, excludeEmails)

  if (result.token) {
    if (result.token.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS) {
      return {
        accessToken: result.token.accessToken,
        projectId: result.token.projectId,
        email: result.token.email,
      }
    }
    const refreshed = await refreshAndStore(db, result.token)
    if (refreshed) {
      return { accessToken: refreshed.accessToken, projectId: refreshed.projectId, email: refreshed.email }
    }
    return getTokenWithAutoWait(db, model, [...excludeEmails, result.token.email], depth + 1)
  }

  if (result.waitMs !== null && result.waitMs <= MAX_AUTO_WAIT_MS && result.nearestEmail) {
    await new Promise(resolve => setTimeout(resolve, result.waitMs! + 100))
    return getTokenWithAutoWait(db, model, excludeEmails, depth + 1)
  }

  return null
}

export async function markRateLimited(
  db: D1Database,
  email: string,
  _model: string,
  retryAfterMs: number
): Promise<void> {
  const d1 = drizzle(db)
  const until = Date.now() + retryAfterMs

  await d1.update(tokens).set({ rateLimitUntil: until, updatedAt: Date.now() }).where(eq(tokens.email, email))
  invalidateCache()
}

export async function setStoredToken(db: D1Database, token: StoredToken): Promise<void> {
  const d1 = drizzle(db)

  await d1
    .insert(tokens)
    .values({
      email: token.email,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      projectId: token.projectId,
      expiresAt: token.expiresAt,
      tier: token.tier,
      rateLimitUntil: token.rateLimitUntil,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: tokens.email,
      set: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        projectId: token.projectId,
        expiresAt: token.expiresAt,
        tier: token.tier,
        rateLimitUntil: token.rateLimitUntil,
        updatedAt: Date.now(),
      },
    })
  invalidateCache()
}

export async function deleteStoredToken(db: D1Database, email: string): Promise<void> {
  const d1 = drizzle(db)
  await d1.delete(tokens).where(eq(tokens.email, email))
  invalidateCache()
}

export async function getValidAccessToken(
  db: D1Database,
  model: string,
  excludeEmails: string[] = []
): Promise<{ accessToken: string; projectId: string; email: string } | null> {
  const stored = await getTokenForModel(db, model, excludeEmails)
  if (!stored) return null

  const bufferMs = 5 * 60 * 1000
  if (stored.expiresAt > Date.now() + bufferMs) {
    return { accessToken: stored.accessToken, projectId: stored.projectId, email: stored.email }
  }

  const refreshed = await refreshAndStore(db, stored)
  return refreshed
    ? { accessToken: refreshed.accessToken, projectId: refreshed.projectId, email: refreshed.email }
    : null
}

export async function refreshAndStore(db: D1Database, stored: StoredToken): Promise<StoredToken | null> {
  try {
    const result = await refreshAccessToken(stored.refreshToken)

    const updated: StoredToken = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken ?? stored.refreshToken,
      projectId: stored.projectId,
      expiresAt: result.expiresAt,
      email: stored.email,
      rateLimitUntil: stored.rateLimitUntil,
    }

    await setStoredToken(db, updated)
    return updated
  } catch {
    return null
  }
}

export async function handleTokenRefresh(db: D1Database): Promise<{ success: boolean; refreshed: number; errors: string[] }> {
  const allTokens = await getAllTokens(db)
  if (allTokens.length === 0) {
    return { success: false, refreshed: 0, errors: ['No tokens stored'] }
  }

  let refreshed = 0
  const errors: string[] = []

  for (const token of allTokens) {
    try {
      await refreshAndStore(db, token)
      refreshed++
    } catch (e) {
      errors.push(`${token.email}: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  return { success: errors.length === 0, refreshed, errors }
}

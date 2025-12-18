import { drizzle } from 'drizzle-orm/d1'
import { eq, or, lt, isNull } from 'drizzle-orm'
import { tokens, type Token } from './db/schema'
import { refreshAccessToken } from './oauth'
import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
  QUOTA_GROUPS,
  GROUP_DISPLAY_NAMES,
} from './constants'

const CACHE_TTL_MS = 30 * 1000
let cachedTokens: StoredToken[] | null = null
let cacheTimestamp = 0

function invalidateCache(): void {
  cachedTokens = null
  cacheTimestamp = 0
}

export interface QuotaGroupInfo {
  group: string
  displayName: string
  remainingFraction: number | null
  isExhausted: boolean
  resetTime: string | null
  resetTimestamp: number | null
}

export interface AccountQuotaInfo {
  email: string
  projectId: string
  status: 'success' | 'error'
  error?: string
  groups: QuotaGroupInfo[]
  fetchedAt: number
}

export interface StoredToken {
  accessToken: string
  refreshToken: string
  projectId: string
  expiresAt: number
  email: string
  tier?: string
  rateLimitUntil?: {
    gemini?: number
    claude?: number
  }
}

export type ModelFamily = 'gemini' | 'claude'

function tokenFromRow(row: Token): StoredToken {
  return {
    email: row.email,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    projectId: row.projectId,
    expiresAt: row.expiresAt,
    tier: row.tier ?? undefined,
    rateLimitUntil: {
      gemini: row.geminiRateLimitUntil ?? undefined,
      claude: row.claudeRateLimitUntil ?? undefined,
    },
  }
}

function getModelFamily(model: string): ModelFamily {
  return model.includes('claude') ? 'claude' : 'gemini'
}

export async function getAllTokens(db: D1Database): Promise<StoredToken[]> {
  const now = Date.now()
  if (cachedTokens && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTokens
  }

  const d1 = drizzle(db)
  const rows = await d1.select().from(tokens)
  cachedTokens = rows.map(tokenFromRow)
  cacheTimestamp = now
  return cachedTokens
}

export async function getTokenForModel(db: D1Database, model: string): Promise<StoredToken | null> {
  const d1 = drizzle(db)
  const now = Date.now()
  const family = getModelFamily(model)

  const rateLimitColumn = family === 'claude' ? tokens.claudeRateLimitUntil : tokens.geminiRateLimitUntil

  const available = await d1
    .select()
    .from(tokens)
    .where(or(isNull(rateLimitColumn), lt(rateLimitColumn, now)))

  if (available.length > 0) {
    const selected = available[Math.floor(Math.random() * available.length)]
    return tokenFromRow(selected)
  }

  const all = await d1.select().from(tokens)
  if (all.length === 0) return null

  const selected = all[Math.floor(Math.random() * all.length)]
  return tokenFromRow(selected)
}

export async function markRateLimited(
  db: D1Database,
  email: string,
  model: string,
  retryAfterMs: number
): Promise<void> {
  const d1 = drizzle(db)
  const family = getModelFamily(model)
  const until = Date.now() + retryAfterMs

  const updateData = family === 'claude'
    ? { claudeRateLimitUntil: until, updatedAt: Date.now() }
    : { geminiRateLimitUntil: until, updatedAt: Date.now() }

  await d1.update(tokens).set(updateData).where(eq(tokens.email, email))
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
      geminiRateLimitUntil: token.rateLimitUntil?.gemini,
      claudeRateLimitUntil: token.rateLimitUntil?.claude,
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
        geminiRateLimitUntil: token.rateLimitUntil?.gemini,
        claudeRateLimitUntil: token.rateLimitUntil?.claude,
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
  model: string
): Promise<{ accessToken: string; projectId: string; email: string } | null> {
  const stored = await getTokenForModel(db, model)
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

interface FetchAvailableModelsResponse {
  models?: Record<string, {
    quotaInfo?: {
      remainingFraction?: number | null
      resetTime?: string
    }
    displayName?: string
  }>
}

export async function fetchQuotaFromApi(
  accessToken: string,
  projectId: string
): Promise<{ status: 'success' | 'error'; error?: string; models: Record<string, { remainingFraction: number | null; resetTime: string | null; resetTimestamp: number | null }> }> {
  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:fetchAvailableModels`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project: projectId }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { status: 'error', error: errorText, models: {} }
  }

  const data = (await response.json()) as FetchAvailableModelsResponse
  const models: Record<string, { remainingFraction: number | null; resetTime: string | null; resetTimestamp: number | null }> = {}

  for (const [modelName, modelInfo] of Object.entries(data.models ?? {})) {
    const quotaInfo = modelInfo.quotaInfo
    const remaining = quotaInfo?.remainingFraction ?? null
    const resetTimeIso = quotaInfo?.resetTime ?? null

    let resetTimestamp: number | null = null
    if (resetTimeIso) {
      const resetDt = new Date(resetTimeIso)
      if (!isNaN(resetDt.getTime())) {
        resetTimestamp = resetDt.getTime()
      }
    }

    models[modelName] = {
      remainingFraction: remaining,
      resetTime: resetTimeIso,
      resetTimestamp,
    }
  }

  return { status: 'success', models }
}

export async function getAccountQuotaInfo(
  db: D1Database,
  token: StoredToken
): Promise<AccountQuotaInfo> {
  const bufferMs = 5 * 60 * 1000
  let accessToken = token.accessToken

  if (token.expiresAt <= Date.now() + bufferMs) {
    const refreshed = await refreshAndStore(db, token)
    if (!refreshed) {
      return {
        email: token.email,
        projectId: token.projectId,
        status: 'error',
        error: 'Failed to refresh token',
        groups: [],
        fetchedAt: Date.now(),
      }
    }
    accessToken = refreshed.accessToken
  }

  const result = await fetchQuotaFromApi(accessToken, token.projectId)

  if (result.status === 'error') {
    return {
      email: token.email,
      projectId: token.projectId,
      status: 'error',
      error: result.error,
      groups: [],
      fetchedAt: Date.now(),
    }
  }

  const groups: QuotaGroupInfo[] = []

  for (const [groupKey, groupModels] of Object.entries(QUOTA_GROUPS)) {
    let bestRemaining: number | null = null
    let bestResetTime: string | null = null
    let bestResetTimestamp: number | null = null

    for (const model of groupModels) {
      const modelData = result.models[model]
      if (!modelData) continue

      if (modelData.remainingFraction !== null) {
        if (bestRemaining === null || modelData.remainingFraction > bestRemaining) {
          bestRemaining = modelData.remainingFraction
          bestResetTime = modelData.resetTime
          bestResetTimestamp = modelData.resetTimestamp
        }
      }
    }

    groups.push({
      group: groupKey,
      displayName: GROUP_DISPLAY_NAMES[groupKey] ?? groupKey,
      remainingFraction: bestRemaining,
      isExhausted: bestRemaining !== null && bestRemaining <= 0,
      resetTime: bestResetTime,
      resetTimestamp: bestResetTimestamp,
    })
  }

  return {
    email: token.email,
    projectId: token.projectId,
    status: 'success',
    groups,
    fetchedAt: Date.now(),
  }
}

export async function getAllAccountsQuota(db: D1Database): Promise<AccountQuotaInfo[]> {
  const allTokens = await getAllTokens(db)
  return Promise.all(allTokens.map(token => getAccountQuotaInfo(db, token)))
}

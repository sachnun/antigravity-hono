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
import { parseRateLimitDelay } from './shared/rate-limit'
import { CACHE_TTL_MS, MAX_AUTO_WAIT_MS, TOKEN_EXPIRY_BUFFER_MS } from './shared/constants'
export { parseRateLimitDelay }

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

export async function getTokenForModel(
  db: D1Database,
  model: string,
  excludeEmails: string[] = []
): Promise<StoredToken | null> {
  const d1 = drizzle(db)
  const now = Date.now()
  const family = getModelFamily(model)

  const rateLimitColumn = family === 'claude' ? tokens.claudeRateLimitUntil : tokens.geminiRateLimitUntil

  const available = await d1
    .select()
    .from(tokens)
    .where(or(isNull(rateLimitColumn), lt(rateLimitColumn, now)))

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
  model: string,
  excludeEmails: string[] = []
): Promise<SmartTokenResult> {
  const d1 = drizzle(db)
  const now = Date.now()
  const family = getModelFamily(model)

  const all = await d1.select().from(tokens)
  const filtered = all.filter(t => !excludeEmails.includes(t.email))

  if (filtered.length === 0) {
    return { token: null, waitMs: null, nearestEmail: null }
  }

  const getRateLimitUntil = (t: Token) => 
    family === 'claude' ? t.claudeRateLimitUntil : t.geminiRateLimitUntil

  const available = filtered.filter(t => {
    const rl = getRateLimitUntil(t)
    return !rl || rl < now
  })

  if (available.length > 0) {
    const selected = available[Math.floor(Math.random() * available.length)]
    return { token: tokenFromRow(selected), waitMs: null, nearestEmail: null }
  }

  let nearestToken: Token | null = null
  let nearestWait = Infinity

  for (const t of filtered) {
    const rl = getRateLimitUntil(t)
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
  excludeEmails: string[] = []
): Promise<{ accessToken: string; projectId: string; email: string } | null> {
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
    return getTokenWithAutoWait(db, model, [...excludeEmails, result.token.email])
  }

  if (result.waitMs !== null && result.waitMs <= MAX_AUTO_WAIT_MS && result.nearestEmail) {
    await new Promise(resolve => setTimeout(resolve, result.waitMs! + 100))
    return getTokenWithAutoWait(db, model, excludeEmails)
  }

  return null
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

const WARMUP_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-5',
  'gemini-3-pro': 'gemini-3-pro-low',
  'gemini-3-flash': 'gemini-3-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash-lite',
}

async function sendWarmupRequest(
  accessToken: string,
  projectId: string,
  model: string
): Promise<{ success: boolean; error?: string }> {
  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:generateContent`

  const body = {
    project: projectId,
    model,
    userAgent: 'antigravity',
    requestId: crypto.randomUUID(),
    request: {
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      generationConfig: { maxOutputTokens: 1 },
      sessionId: crypto.randomUUID(),
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { success: false, error: errorText }
  }

  return { success: true }
}

export interface WarmupResult {
  email: string
  warmedUp: string[]
  skipped: string[]
  errors: { group: string; error: string }[]
}

export async function warmUpAccount(
  db: D1Database,
  token: StoredToken
): Promise<WarmupResult> {
  const result: WarmupResult = {
    email: token.email,
    warmedUp: [],
    skipped: [],
    errors: [],
  }

  const bufferMs = 5 * 60 * 1000
  let accessToken = token.accessToken

  if (token.expiresAt <= Date.now() + bufferMs) {
    const refreshed = await refreshAndStore(db, token)
    if (!refreshed) {
      result.errors.push({ group: '*', error: 'Failed to refresh token' })
      return result
    }
    accessToken = refreshed.accessToken
  }

  const quotaResult = await fetchQuotaFromApi(accessToken, token.projectId)
  if (quotaResult.status === 'error') {
    result.errors.push({ group: '*', error: quotaResult.error ?? 'Failed to fetch quota' })
    return result
  }

  for (const [group, warmupModel] of Object.entries(WARMUP_MODELS)) {
    const groupModels = QUOTA_GROUPS[group] ?? []

    let needsWarmup = false
    for (const model of groupModels) {
      const modelData = quotaResult.models[model]
      if (modelData?.remainingFraction === 1) {
        needsWarmup = true
        break
      }
    }

    if (!needsWarmup) {
      result.skipped.push(group)
      continue
    }

    const warmupResult = await sendWarmupRequest(accessToken, token.projectId, warmupModel)
    if (warmupResult.success) {
      result.warmedUp.push(group)
    } else {
      result.errors.push({ group, error: warmupResult.error ?? 'Unknown error' })
    }
  }

  return result
}

export async function warmUpAllAccounts(db: D1Database): Promise<WarmupResult[]> {
  const allTokens = await getAllTokens(db)
  return Promise.all(allTokens.map(token => warmUpAccount(db, token)))
}

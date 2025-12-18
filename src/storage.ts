import { refreshAccessToken } from './oauth'
import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
  QUOTA_GROUPS,
  GROUP_DISPLAY_NAMES,
} from './constants'

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

const TOKENS_KEY = 'tokens'
const CACHE_TTL_MS = 30 * 1000

let cachedTokens: StoredToken[] | null = null
let cacheTimestamp = 0

export async function getAllTokens(kv: KVNamespace): Promise<StoredToken[]> {
  const now = Date.now()
  if (cachedTokens && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedTokens
  }
  
  const data = await kv.get(TOKENS_KEY, 'json')
  cachedTokens = (data as StoredToken[]) ?? []
  cacheTimestamp = now
  return cachedTokens
}

export async function setAllTokens(kv: KVNamespace, tokens: StoredToken[]): Promise<void> {
  cachedTokens = tokens
  cacheTimestamp = Date.now()
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
  kv: KVNamespace,
  token: StoredToken
): Promise<AccountQuotaInfo> {
  const bufferMs = 5 * 60 * 1000
  let accessToken = token.accessToken

  if (token.expiresAt <= Date.now() + bufferMs) {
    const refreshed = await refreshAndStore(kv, token)
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

export async function getAllAccountsQuota(kv: KVNamespace): Promise<AccountQuotaInfo[]> {
  const tokens = await getAllTokens(kv)
  return Promise.all(tokens.map(token => getAccountQuotaInfo(kv, token)))
}

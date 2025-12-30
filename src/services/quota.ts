import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
  QUOTA_GROUPS,
  GROUP_DISPLAY_NAMES,
} from '../constants'
import { type StoredToken, refreshAndStore, getAllTokens } from './tokens'

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

import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
  QUOTA_GROUPS,
} from '../constants'
import { type StoredToken, getAllTokens, refreshAndStore } from './tokens'
import { fetchQuotaFromApi } from './quota'

const WARMUP_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-5',
  'gemini-3-pro': 'gemini-3-pro-low',
  'gemini-3-flash': 'gemini-3-flash',
  'gemini-2.5-flash': 'gemini-2.5-flash',
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

  // Cancel the body to prevent stalled response deadlock
  await response.body?.cancel()
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

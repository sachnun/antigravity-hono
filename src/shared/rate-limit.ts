export interface RateLimitInfo {
  isRateLimited: boolean
  retryDelayMs: number | null
  errorText: string | null
}

export function parseRateLimitError(text: string): string | null {
  try {
    const data = JSON.parse(text)
    const details = data.error?.details ?? []
    for (const detail of details) {
      if (detail.retryDelay) return detail.retryDelay
    }
    if (data.error?.quotaResetDelay) return data.error.quotaResetDelay
  } catch {}
  return null
}

export function parseDelaySeconds(delay: string): number {
  const match = delay.match(/^([\d.]+)s?$/)
  return match ? parseFloat(match[1]) : 0
}

export function extractRateLimitInfo(response: Response, errorText: string): RateLimitInfo {
  if (response.status !== 429) {
    return { isRateLimited: false, retryDelayMs: null, errorText: null }
  }
  const retryDelay = parseRateLimitError(errorText)
  const retryDelayMs = retryDelay ? parseDelaySeconds(retryDelay) * 1000 : null
  return { isRateLimited: true, retryDelayMs, errorText }
}

export function parseRateLimitDelay(errorText: string): number | null {
  try {
    const data = JSON.parse(errorText)
    const details = data.error?.details ?? []
    for (const detail of details) {
      if (detail.retryDelay) {
        const match = detail.retryDelay.match(/^([\d.]+)s?$/)
        if (match) return parseFloat(match[1]) * 1000
      }
    }
    if (data.error?.quotaResetDelay) {
      const match = data.error.quotaResetDelay.match(/^([\d.]+)s?$/)
      if (match) return parseFloat(match[1]) * 1000
    }
  } catch {}
  return null
}

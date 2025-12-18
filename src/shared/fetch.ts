const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 5000

function parseRateLimitError(text: string): string | null {
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

function parseDelaySeconds(delay: string): number {
  const match = delay.match(/^([\d.]+)s?$/)
  return match ? parseFloat(match[1]) : 0
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, options)
    if (response.status !== 429) return response

    const errorText = await response.text()
    const retryDelay = parseRateLimitError(errorText)
    if (!retryDelay) throw new Error(`Rate limited: ${errorText}`)

    const delayMs = parseDelaySeconds(retryDelay) * 1000
    if (attempt < MAX_RETRIES - 1 && delayMs > 0 && delayMs <= MAX_RETRY_DELAY_MS) {
      await sleep(delayMs)
      continue
    }
    throw new Error(`Rate limited after ${MAX_RETRIES} retries`)
  }
  throw new Error('Rate limited after max retries')
}

import { CODE_ASSIST_ENDPOINTS, CODE_ASSIST_HEADERS } from '../constants'

export interface ApiRequestOptions {
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
  accessToken: string
  stream?: boolean
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function apiRequest(options: ApiRequestOptions): Promise<Response> {
  const { path, method = 'POST', body, accessToken, stream = false } = options

  const headers: Record<string, string> = {
    ...CODE_ASSIST_HEADERS,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  if (stream) headers.Accept = 'text/event-stream'

  const requestBody = body ? JSON.stringify(body) : undefined

  for (const endpoint of CODE_ASSIST_ENDPOINTS) {
    let lastResponse: Response | null = null
    for (let retry = 0; retry < 3; retry++) {
      const response = await fetch(`${endpoint}${path}`, { method, headers, body: requestBody })
      if (response.status !== 429) return response
      lastResponse = response
      if (retry < 2) await sleep(500 * (retry + 1))
    }
    if (lastResponse && lastResponse.status !== 429) return lastResponse
  }

  const lastEndpoint = CODE_ASSIST_ENDPOINTS[CODE_ASSIST_ENDPOINTS.length - 1]
  return fetch(`${lastEndpoint}${path}`, { method, headers, body: requestBody })
}

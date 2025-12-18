import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
} from '../constants'
import { resolveGeminiModelName } from './models'

const INTERNAL_MODEL_MAP: Record<string, string> = {
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
  'gemini-3-pro-preview': 'gemini-3-pro-low',
}

function generateRequestId(): string {
  return crypto.randomUUID()
}

export async function handleGeminiGenerateContent(
  request: Record<string, unknown>,
  modelId: string,
  accessToken: string,
  projectId: string
): Promise<Response> {
  const modelName = resolveGeminiModelName(modelId)
  const effectiveModel = INTERNAL_MODEL_MAP[modelName] ?? modelName

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...request, sessionId: generateRequestId() },
  }

  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:generateContent`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wrappedBody),
  })

  const data = await response.json()
  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleGeminiGenerateContentStream(
  request: Record<string, unknown>,
  modelId: string,
  accessToken: string,
  projectId: string
): Promise<Response> {
  const modelName = resolveGeminiModelName(modelId)
  const effectiveModel = INTERNAL_MODEL_MAP[modelName] ?? modelName

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...request, sessionId: generateRequestId() },
  }

  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(wrappedBody),
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

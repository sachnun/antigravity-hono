import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
} from '../constants'
import type { GeminiGenerateContentRequest, GeminiGenerateContentResponse } from './schemas'
import { resolveGeminiModelName } from './models'

const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 5000

const INTERNAL_MODEL_MAP: Record<string, string> = {
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
  'gemini-3-pro-preview': 'gemini-3-pro-low',
}

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
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

function generateRequestId(): string {
  return crypto.randomUUID()
}

interface InternalResponse {
  response?: {
    candidates?: Array<{
      content?: {
        role?: string
        parts?: Array<{
          text?: string
          thought?: boolean
          thoughtSignature?: string
          functionCall?: { name: string; args: Record<string, unknown> }
        }>
      }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
      thoughtsTokenCount?: number
      cachedContentTokenCount?: number
    }
  }
  error?: { code?: number; message?: string; status?: string }
}

function convertInternalToGemini(data: InternalResponse): GeminiGenerateContentResponse {
  const response = data.response
  const candidates = response?.candidates?.map((candidate, index) => ({
    content: {
      role: candidate.content?.role ?? 'model',
      parts: candidate.content?.parts?.map(part => ({
        text: part.text,
        thought: part.thought,
        thoughtSignature: part.thoughtSignature,
        functionCall: part.functionCall,
      })) ?? [],
    },
    finishReason: candidate.finishReason,
    index,
  })) ?? []

  return {
    candidates,
    usageMetadata: response?.usageMetadata ? {
      promptTokenCount: response.usageMetadata.promptTokenCount,
      candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
      totalTokenCount: response.usageMetadata.totalTokenCount,
      thoughtsTokenCount: response.usageMetadata.thoughtsTokenCount,
      cachedContentTokenCount: response.usageMetadata.cachedContentTokenCount,
    } : undefined,
  }
}

export async function handleGeminiGenerateContent(
  request: GeminiGenerateContentRequest,
  modelId: string,
  accessToken: string,
  projectId: string
): Promise<GeminiGenerateContentResponse | Response> {
  const modelName = resolveGeminiModelName(modelId)
  const effectiveModel = INTERNAL_MODEL_MAP[modelName] ?? modelName

  const geminiRequest: Record<string, unknown> = {
    contents: request.contents,
    generationConfig: request.generationConfig,
  }

  if (request.systemInstruction) {
    geminiRequest.systemInstruction = request.systemInstruction
  }
  if (request.tools) {
    geminiRequest.tools = request.tools
  }
  if (request.safetySettings) {
    geminiRequest.safetySettings = request.safetySettings
  }

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...geminiRequest, sessionId: generateRequestId() },
  }

  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:generateContent`

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wrappedBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({
      error: {
        code: response.status,
        message: errorText,
        status: 'INTERNAL',
      },
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await response.json() as InternalResponse
  return convertInternalToGemini(data)
}

export async function handleGeminiGenerateContentStream(
  request: GeminiGenerateContentRequest,
  modelId: string,
  accessToken: string,
  projectId: string
): Promise<ReadableStream<Uint8Array> | Response> {
  const modelName = resolveGeminiModelName(modelId)
  const effectiveModel = INTERNAL_MODEL_MAP[modelName] ?? modelName

  const geminiRequest: Record<string, unknown> = {
    contents: request.contents,
    generationConfig: request.generationConfig,
  }

  if (request.systemInstruction) {
    geminiRequest.systemInstruction = request.systemInstruction
  }
  if (request.tools) {
    geminiRequest.tools = request.tools
  }
  if (request.safetySettings) {
    geminiRequest.safetySettings = request.safetySettings
  }

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...geminiRequest, sessionId: generateRequestId() },
  }

  const url = `${CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      ...CODE_ASSIST_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(wrappedBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({
      error: {
        code: response.status,
        message: errorText,
        status: 'INTERNAL',
      },
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let buffer = ''

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const json = line.slice(5).trim()
        if (!json || json === '[DONE]') continue

        try {
          let parsed = JSON.parse(json) as unknown
          if (Array.isArray(parsed)) parsed = parsed[0]
          if (!parsed || typeof parsed !== 'object') continue

          const internalData = parsed as InternalResponse
          const geminiResponse = convertInternalToGemini(internalData)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(geminiResponse)}\n\n`))
        } catch {}
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  })

  return response.body!.pipeThrough(transformStream)
}

import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
} from '../constants'
import type {
  AnthropicMessageRequest,
  AnthropicMessageResponse,
  ResponseContentBlock,
} from './schemas'
import { resolveModelAlias } from './models'

const MAX_RETRIES = 3
const MAX_RETRY_DELAY_MS = 5000

const INTERNAL_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
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

function generateMessageId(): string {
  return `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

function generateRequestId(): string {
  return crypto.randomUUID()
}

interface GeminiContent {
  role: string
  parts: Array<{
    text?: string
    thought?: boolean
    thoughtSignature?: string
    inlineData?: { mimeType: string; data: string }
    functionCall?: { name: string; args: Record<string, unknown>; id?: string }
    functionResponse?: { name: string; response: unknown; id?: string }
  }>
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }>
}

function extractSystemPrompt(request: AnthropicMessageRequest): string | undefined {
  if (!request.system) return undefined
  if (typeof request.system === 'string') return request.system
  return request.system.map(block => block.text).join('\n')
}

function convertMessagesToGemini(
  messages: AnthropicMessageRequest['messages'],
  thinkingEnabled: boolean
): GeminiContent[] {
  const contents: GeminiContent[] = []
  const toolIdToName: Record<string, string> = {}

  for (const msg of messages) {
    if (typeof msg.content !== 'string') {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolIdToName[block.id] = block.name
        }
      }
    }
  }

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user'
    const parts: GeminiContent['parts'] = []

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content })
    } else {
      let pendingToolResults: GeminiContent['parts'] = []

      for (const block of msg.content) {
        if (block.type === 'text') {
          if (pendingToolResults.length > 0) {
            contents.push({ role: 'user', parts: pendingToolResults })
            pendingToolResults = []
          }
          parts.push({ text: block.text })
        } else if (block.type === 'image') {
          if (pendingToolResults.length > 0) {
            contents.push({ role: 'user', parts: pendingToolResults })
            pendingToolResults = []
          }
          if (block.source.type === 'base64' && block.source.data && block.source.media_type) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type,
                data: block.source.data,
              },
            })
          }
        } else if (block.type === 'tool_use') {
          const funcPart: GeminiContent['parts'][0] = {
            functionCall: {
              name: block.name,
              args: block.input as Record<string, unknown>,
              id: block.id,
            },
          }
          if (thinkingEnabled) {
            funcPart.thoughtSignature = 'skip_thought_signature_validator'
          }
          parts.push(funcPart)
        } else if (block.type === 'tool_result') {
          let parsedContent: unknown
          if (typeof block.content === 'string') {
            try {
              parsedContent = JSON.parse(block.content)
            } catch {
              parsedContent = block.content
            }
          } else {
            parsedContent = block.content
          }
          const funcName = toolIdToName[block.tool_use_id] ?? 'unknown_function'
          pendingToolResults.push({
            functionResponse: {
              name: funcName,
              response: { result: parsedContent },
              id: block.tool_use_id,
            },
          })
        } else if (block.type === 'thinking') {
          parts.push({
            text: block.thinking,
            thought: true,
            thoughtSignature: block.signature,
          })
        }
      }

      if (pendingToolResults.length > 0) {
        if (parts.length > 0) {
          contents.push({ role, parts })
        }
        contents.push({ role: 'user', parts: pendingToolResults })
        continue
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts })
    }
  }

  return contents
}

function convertToolsToGemini(tools: AnthropicMessageRequest['tools']): GeminiTool[] | undefined {
  if (!tools?.length) return undefined
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema as Record<string, unknown>,
    })),
  }]
}

interface AntigravityResponse {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
          thought?: boolean
          thoughtSignature?: string
          functionCall?: { name: string; args: Record<string, unknown>; id?: string }
        }>
      }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
      thoughtsTokenCount?: number
    }
  }
  error?: { code?: number; message?: string; status?: string }
}

function convertGeminiToAnthropic(
  data: AntigravityResponse,
  model: string,
  messageId: string,
  includeThinking: boolean
): AnthropicMessageResponse {
  const response = data.response
  const candidate = response?.candidates?.[0]
  const parts = candidate?.content?.parts ?? []

  const content: ResponseContentBlock[] = []

  for (const part of parts) {
    if (part.text) {
      if (part.thought && includeThinking) {
        content.push({
          type: 'thinking',
          thinking: part.text,
          signature: part.thoughtSignature ?? '',
        })
      } else if (!part.thought) {
        content.push({
          type: 'text',
          text: part.text,
        })
      }
    }
    if (part.functionCall) {
      content.push({
        type: 'tool_use',
        id: `toolu_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        name: part.functionCall.name,
        input: part.functionCall.args,
      })
    }
  }

  const stopReasonMap: Record<string, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'> = {
    STOP: 'end_turn',
    MAX_TOKENS: 'max_tokens',
    SAFETY: 'end_turn',
  }

  let stopReason = stopReasonMap[candidate?.finishReason ?? ''] ?? 'end_turn'
  if (content.some(c => c.type === 'tool_use')) {
    stopReason = 'tool_use'
  }

  const usage = response?.usageMetadata
  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
    },
  }
}

export async function handleAnthropicMessage(
  request: AnthropicMessageRequest,
  accessToken: string,
  projectId: string
): Promise<AnthropicMessageResponse | Response> {
  const resolvedModel = resolveModelAlias(request.model)
  const effectiveModel = INTERNAL_MODEL_MAP[resolvedModel] ?? resolvedModel

  const thinkingEnabled = request.thinking?.type === 'enabled'
  const thinkingBudget = thinkingEnabled && request.thinking?.type === 'enabled' 
    ? request.thinking.budget_tokens 
    : undefined

  const systemPrompt = extractSystemPrompt(request)
  const contents = convertMessagesToGemini(request.messages, thinkingEnabled)
  const tools = convertToolsToGemini(request.tools)

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.max_tokens,
  }
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.top_k !== undefined) generationConfig.topK = request.top_k
  if (request.stop_sequences) generationConfig.stopSequences = request.stop_sequences

  if (thinkingEnabled && thinkingBudget) {
    generationConfig.thinkingConfig = {
      thinkingBudget,
      includeThoughts: true,
    }
    const currentMax = request.max_tokens
    const requiredMax = thinkingBudget + 4096
    if (currentMax <= thinkingBudget) {
      generationConfig.maxOutputTokens = requiredMax
    }
  }

  const geminiRequest: Record<string, unknown> = {
    contents,
    generationConfig,
  }
  if (systemPrompt) {
    geminiRequest.systemInstruction = { parts: [{ text: systemPrompt }] }
  }
  if (tools) geminiRequest.tools = tools

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...geminiRequest, sessionId: generateRequestId() },
  }

  if (thinkingEnabled) {
    return collectStreamingResponse(wrappedBody, accessToken, resolvedModel, true)
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
      type: 'error',
      error: {
        type: 'api_error',
        message: errorText,
      },
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await response.json() as AntigravityResponse
  const messageId = generateMessageId()
  return convertGeminiToAnthropic(data, resolvedModel, messageId, thinkingEnabled)
}

async function collectStreamingResponse(
  wrappedBody: Record<string, unknown>,
  accessToken: string,
  model: string,
  includeThinking: boolean
): Promise<AnthropicMessageResponse> {
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
    throw new Error(errorText)
  }

  const messageId = generateMessageId()
  const decoder = new TextDecoder()
  const content: ResponseContentBlock[] = []
  let inputTokens = 0
  let outputTokens = 0
  let stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' = 'end_turn'

  let currentText = ''
  let currentThinking = ''
  let currentThinkingSignature = ''

  const reader = response.body!.getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
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

        const geminiData = parsed as AntigravityResponse
        const candidate = geminiData.response?.candidates?.[0]
        const parts = candidate?.content?.parts ?? []

        for (const part of parts) {
          if (part.text) {
            if (part.thought && includeThinking) {
              currentThinking += part.text
              if (part.thoughtSignature) {
                currentThinkingSignature = part.thoughtSignature
              }
            } else if (!part.thought) {
              currentText += part.text
            }
          }
          if (part.functionCall) {
            content.push({
              type: 'tool_use',
              id: `toolu_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
              name: part.functionCall.name,
              input: part.functionCall.args,
            })
          }
        }

        if (candidate?.finishReason) {
          const stopReasonMap: Record<string, 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'> = {
            STOP: 'end_turn',
            MAX_TOKENS: 'max_tokens',
          }
          stopReason = stopReasonMap[candidate.finishReason] ?? 'end_turn'

          if (geminiData.response?.usageMetadata) {
            inputTokens = geminiData.response.usageMetadata.promptTokenCount ?? 0
            outputTokens = geminiData.response.usageMetadata.candidatesTokenCount ?? 0
          }
        }
      } catch {}
    }
  }

  if (currentThinking) {
    content.unshift({
      type: 'thinking',
      thinking: currentThinking,
      signature: currentThinkingSignature,
    })
  }

  if (currentText) {
    content.push({
      type: 'text',
      text: currentText,
    })
  }

  if (content.some(c => c.type === 'tool_use')) {
    stopReason = 'tool_use'
  }

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  }
}

export async function handleAnthropicMessageStream(
  request: AnthropicMessageRequest,
  accessToken: string,
  projectId: string
): Promise<ReadableStream<Uint8Array> | Response> {
  const resolvedModel = resolveModelAlias(request.model)
  const effectiveModel = INTERNAL_MODEL_MAP[resolvedModel] ?? resolvedModel

  const thinkingEnabled = request.thinking?.type === 'enabled'
  const thinkingBudget = thinkingEnabled && request.thinking?.type === 'enabled' 
    ? request.thinking.budget_tokens 
    : undefined

  const systemPrompt = extractSystemPrompt(request)
  const contents = convertMessagesToGemini(request.messages, thinkingEnabled)
  const tools = convertToolsToGemini(request.tools)

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.max_tokens,
  }
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.top_k !== undefined) generationConfig.topK = request.top_k
  if (request.stop_sequences) generationConfig.stopSequences = request.stop_sequences

  if (thinkingEnabled && thinkingBudget) {
    generationConfig.thinkingConfig = {
      thinkingBudget,
      includeThoughts: true,
    }
    const currentMax = request.max_tokens
    const requiredMax = thinkingBudget + 4096
    if (currentMax <= thinkingBudget) {
      generationConfig.maxOutputTokens = requiredMax
    }
  }

  const geminiRequest: Record<string, unknown> = {
    contents,
    generationConfig,
  }
  if (systemPrompt) {
    geminiRequest.systemInstruction = { parts: [{ text: systemPrompt }] }
  }
  if (tools) geminiRequest.tools = tools

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
      type: 'error',
      error: {
        type: 'api_error',
        message: errorText,
      },
    }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const messageId = generateMessageId()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let contentBlockIndex = 0
  let buffer = ''
  let outputTokens = 0
  let isFirstTextChunk = true
  let isFirstThinkingChunk = true
  let textBlockStarted = false
  let thinkingBlockStarted = false
  const currentToolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = []

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      const messageStart = {
        type: 'message_start',
        message: {
          id: messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: resolvedModel,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }
      controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`))
    },
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

          const geminiData = parsed as AntigravityResponse
          const candidate = geminiData.response?.candidates?.[0]
          const parts = candidate?.content?.parts ?? []

          for (const part of parts) {
            if (part.text) {
              if (part.thought && thinkingEnabled) {
                if (isFirstThinkingChunk) {
                  const blockStart = {
                    type: 'content_block_start',
                    index: contentBlockIndex,
                    content_block: { type: 'thinking', thinking: '' },
                  }
                  controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`))
                  thinkingBlockStarted = true
                  isFirstThinkingChunk = false
                }

                const delta = {
                  type: 'content_block_delta',
                  index: contentBlockIndex,
                  delta: { type: 'thinking_delta', thinking: part.text },
                }
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`))
              } else if (!part.thought) {
                if (thinkingBlockStarted && !textBlockStarted) {
                  const blockStop = { type: 'content_block_stop', index: contentBlockIndex }
                  controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`))
                  contentBlockIndex++
                  thinkingBlockStarted = false
                }

                if (isFirstTextChunk) {
                  const blockStart = {
                    type: 'content_block_start',
                    index: contentBlockIndex,
                    content_block: { type: 'text', text: '' },
                  }
                  controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`))
                  textBlockStarted = true
                  isFirstTextChunk = false
                }

                const delta = {
                  type: 'content_block_delta',
                  index: contentBlockIndex,
                  delta: { type: 'text_delta', text: part.text },
                }
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(delta)}\n\n`))
              }
            }

            if (part.functionCall) {
              if (textBlockStarted) {
                const blockStop = { type: 'content_block_stop', index: contentBlockIndex }
                controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`))
                contentBlockIndex++
                textBlockStarted = false
              }

              const toolId = `toolu_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
              currentToolCalls.push({
                id: toolId,
                name: part.functionCall.name,
                args: part.functionCall.args,
              })

              const blockStart = {
                type: 'content_block_start',
                index: contentBlockIndex,
                content_block: {
                  type: 'tool_use',
                  id: toolId,
                  name: part.functionCall.name,
                  input: {},
                },
              }
              controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify(blockStart)}\n\n`))

              const inputDelta = {
                type: 'content_block_delta',
                index: contentBlockIndex,
                delta: {
                  type: 'input_json_delta',
                  partial_json: JSON.stringify(part.functionCall.args),
                },
              }
              controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify(inputDelta)}\n\n`))

              const blockStop = { type: 'content_block_stop', index: contentBlockIndex }
              controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`))
              contentBlockIndex++
            }
          }

          if (candidate?.finishReason) {
            if (geminiData.response?.usageMetadata) {
              outputTokens = geminiData.response.usageMetadata.candidatesTokenCount ?? 0
            }
          }
        } catch {}
      }
    },
    flush(controller) {
      if (thinkingBlockStarted) {
        const blockStop = { type: 'content_block_stop', index: contentBlockIndex }
        controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`))
        contentBlockIndex++
      }

      if (textBlockStarted) {
        const blockStop = { type: 'content_block_stop', index: contentBlockIndex }
        controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify(blockStop)}\n\n`))
      }

      const stopReason = currentToolCalls.length > 0 ? 'tool_use' : 'end_turn'
      const messageDelta = {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens },
      }
      controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`))

      const messageStop = { type: 'message_stop' }
      controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`))
    },
  })

  return response.body!.pipeThrough(transformStream)
}

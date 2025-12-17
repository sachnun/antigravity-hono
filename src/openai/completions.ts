import {
  CODE_ASSIST_ENDPOINT,
  CODE_ASSIST_HEADERS,
} from '../constants'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  Message,
} from './schemas'

const MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-computer-use-preview-10-2025': 'rev19-uic3-1p',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
  'gemini-3-pro-preview': 'gemini-3-pro-high',
  'gemini-claude-sonnet-4-5': 'claude-sonnet-4-5',
  'gemini-claude-sonnet-4-5-thinking': 'claude-sonnet-4-5-thinking',
  'gemini-claude-sonnet-4-5-thinking-high': 'claude-sonnet-4-5-thinking',
  'gemini-claude-sonnet-4-5-thinking-medium': 'claude-sonnet-4-5-thinking',
  'gemini-claude-sonnet-4-5-thinking-low': 'claude-sonnet-4-5-thinking',
  'gemini-claude-opus-4-5-thinking': 'claude-opus-4-5-thinking',
  'gemini-claude-opus-4-5-thinking-high': 'claude-opus-4-5-thinking',
  'gemini-claude-opus-4-5-thinking-medium': 'claude-opus-4-5-thinking',
  'gemini-claude-opus-4-5-thinking-low': 'claude-opus-4-5-thinking',
}

const MODEL_DEFAULT_THINKING: Record<string, { level?: ThinkingLevel; budget?: number }> = {
  'gemini-3-pro-high': { level: 'high' },
  'gemini-3-pro-medium': { level: 'medium' },
  'gemini-3-pro-low': { level: 'low' },
  'gemini-claude-sonnet-4-5-thinking': { budget: 16000 },
  'gemini-claude-sonnet-4-5-thinking-high': { budget: 32000 },
  'gemini-claude-sonnet-4-5-thinking-medium': { budget: 16000 },
  'gemini-claude-sonnet-4-5-thinking-low': { budget: 4000 },
  'gemini-claude-opus-4-5-thinking': { budget: 16000 },
  'gemini-claude-opus-4-5-thinking-high': { budget: 32000 },
  'gemini-claude-opus-4-5-thinking-medium': { budget: 16000 },
  'gemini-claude-opus-4-5-thinking-low': { budget: 4000 },
}

function resolveModelName(model: string): string {
  return MODEL_ALIASES[model] ?? model
}

function generateRequestId(): string {
  return crypto.randomUUID()
}

function generateCompletionId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

type ThinkingLevel = 'low' | 'medium' | 'high'
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

interface ThinkingConfig {
  thinkingLevel?: ThinkingLevel
  thinkingBudget?: number
  includeThoughts?: boolean
}

const THINKING_BUDGET_MAP: Record<ReasoningEffort, number> = {
  none: 0,
  low: 4096,
  medium: 8192,
  high: 16384,
}

function isGemini3Model(model: string): boolean {
  return model.includes('gemini-3') || model.includes('gemini-3-pro')
}

function isGemini25Model(model: string): boolean {
  return model.includes('gemini-2.5') || model.includes('gemini-2')
}

function isClaudeThinkingModel(model: string): boolean {
  return model.includes('claude') && model.includes('thinking')
}

function buildThinkingConfig(
  originalModel: string,
  effectiveModel: string,
  reasoningEffort?: ReasoningEffort,
  thinkingBudget?: number,
  includeThoughts?: boolean
): ThinkingConfig | undefined {
  const modelDefaults = MODEL_DEFAULT_THINKING[originalModel]

  if (reasoningEffort === 'none' && !thinkingBudget && !modelDefaults) {
    return undefined
  }

  const config: ThinkingConfig = {}

  if (isGemini3Model(effectiveModel)) {
    if (thinkingBudget !== undefined) {
      config.thinkingBudget = thinkingBudget
    } else if (reasoningEffort && reasoningEffort !== 'none') {
      config.thinkingLevel = reasoningEffort as ThinkingLevel
    } else if (modelDefaults?.level) {
      config.thinkingLevel = modelDefaults.level
    }
  } else if (isGemini25Model(effectiveModel) || isClaudeThinkingModel(effectiveModel)) {
    if (thinkingBudget !== undefined) {
      config.thinkingBudget = thinkingBudget
    } else if (reasoningEffort && reasoningEffort !== 'none') {
      config.thinkingBudget = THINKING_BUDGET_MAP[reasoningEffort]
    } else if (modelDefaults?.budget) {
      config.thinkingBudget = modelDefaults.budget
    }
  }

  if (includeThoughts !== undefined) {
    config.includeThoughts = includeThoughts
  } else if (modelDefaults) {
    config.includeThoughts = true
  }

  if (Object.keys(config).length === 0) {
    return undefined
  }

  return config
}

interface GeminiContent {
  role: string
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }>
}

function convertMessagesToGemini(messages: Message[]): { contents: GeminiContent[]; systemInstruction?: { parts: Array<{ text: string }> } } {
  const contents: GeminiContent[] = []
  let systemInstruction: { parts: Array<{ text: string }> } | undefined

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : msg.content?.map(p => p.text).filter(Boolean).join('\n') ?? ''
      systemInstruction = { parts: [{ text }] }
      continue
    }

    const role = msg.role === 'assistant' ? 'model' : 'user'
    const parts: GeminiContent['parts'] = []

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content })
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text })
        }
      }
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        parts.push({
          functionCall: {
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments),
          },
        })
      }
    }

    if (msg.role === 'tool' && msg.tool_call_id) {
      parts.push({
        functionResponse: {
          name: msg.name ?? msg.tool_call_id,
          response: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
        },
      })
    }

    if (parts.length > 0) {
      contents.push({ role, parts })
    }
  }

  return { contents, systemInstruction }
}

function convertToolsToGemini(tools: ChatCompletionRequest['tools']): GeminiTool[] | undefined {
  if (!tools?.length) return undefined

  const functionDeclarations = tools.map((tool) => ({
    name: /^\d/.test(tool.function.name) ? `t_${tool.function.name}` : tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))

  return [{ functionDeclarations }]
}

interface AntigravityResponse {
  response?: {
    candidates?: Array<{
      content?: { parts?: Array<{ 
        text?: string
        thought?: boolean
        thoughtSignature?: string
        functionCall?: { name: string; args: Record<string, unknown> } 
      }> }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
      cachedContentTokenCount?: number
      thoughtsTokenCount?: number
    }
  }
  error?: { code?: number; message?: string; status?: string }
}

function convertGeminiToOpenAI(
  data: AntigravityResponse,
  model: string,
  completionId: string,
  created: number,
  includeThoughts?: boolean
): ChatCompletionResponse {
  const response = data.response
  const candidate = response?.candidates?.[0]
  const parts = candidate?.content?.parts ?? []

  let content: string | null = null
  let reasoningContent: string | null = null
  const toolCalls: ChatCompletionResponse['choices'][0]['message']['tool_calls'] = []

  for (const part of parts) {
    if (part.text) {
      if (part.thought) {
        reasoningContent = (reasoningContent ?? '') + part.text
      } else {
        content = (content ?? '') + part.text
      }
    }
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      })
    }
  }

  const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
    STOP: 'stop',
    MAX_TOKENS: 'length',
    SAFETY: 'content_filter',
    RECITATION: 'content_filter',
  }

  let finishReason = finishReasonMap[candidate?.finishReason ?? ''] ?? 'stop'
  if (toolCalls.length > 0) finishReason = 'tool_calls'

  const usage = response?.usageMetadata
  return {
    id: completionId,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content,
        reasoning_content: includeThoughts ? reasoningContent : undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: null,
      },
      finish_reason: finishReason,
      logprobs: null,
    }],
    usage: usage ? {
      prompt_tokens: usage.promptTokenCount ?? 0,
      completion_tokens: usage.candidatesTokenCount ?? 0,
      total_tokens: usage.totalTokenCount ?? 0,
      prompt_tokens_details: usage.cachedContentTokenCount ? { cached_tokens: usage.cachedContentTokenCount } : undefined,
      completion_tokens_details: usage.thoughtsTokenCount ? { reasoning_tokens: usage.thoughtsTokenCount } : undefined,
    } : undefined,
  }
}

async function collectStreamingResponse(
  wrappedBody: Record<string, unknown>,
  accessToken: string,
  model: string,
  includeThoughts: boolean
): Promise<ChatCompletionResponse> {
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

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Antigravity API error: ${response.status} - ${errorText}`)
  }

  const completionId = generateCompletionId()
  const created = Math.floor(Date.now() / 1000)
  const decoder = new TextDecoder()

  let content = ''
  let reasoningContent = ''
  let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop'
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined
  const toolCalls: ChatCompletionResponse['choices'][0]['message']['tool_calls'] = []

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
        const responseObj = geminiData.response
        const candidate = responseObj?.candidates?.[0]
        const parts = candidate?.content?.parts ?? []

        for (const part of parts) {
          if (part.text) {
            if (part.thought) {
              reasoningContent += part.text
            } else {
              content += part.text
            }
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            })
          }
        }

        if (candidate?.finishReason) {
          const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
            STOP: 'stop',
            MAX_TOKENS: 'length',
            SAFETY: 'content_filter',
          }
          finishReason = finishReasonMap[candidate.finishReason] ?? 'stop'
          if (toolCalls.length > 0) finishReason = 'tool_calls'

          if (responseObj?.usageMetadata) {
            usage = {
              prompt_tokens: responseObj.usageMetadata.promptTokenCount ?? 0,
              completion_tokens: responseObj.usageMetadata.candidatesTokenCount ?? 0,
              total_tokens: responseObj.usageMetadata.totalTokenCount ?? 0,
            }
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return {
    id: completionId,
    object: 'chat.completion',
    created,
    model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: content || null,
        reasoning_content: includeThoughts && reasoningContent ? reasoningContent : undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: null,
      },
      finish_reason: finishReason,
      logprobs: null,
    }],
    usage,
  }
}

export async function handleChatCompletion(
  request: ChatCompletionRequest,
  accessToken: string,
  projectId: string
): Promise<ChatCompletionResponse> {
  const effectiveModel = resolveModelName(request.model)
  const { contents, systemInstruction } = convertMessagesToGemini(request.messages)
  const tools = convertToolsToGemini(request.tools)

  const generationConfig: Record<string, unknown> = {}
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.max_tokens) generationConfig.maxOutputTokens = request.max_tokens
  if (request.max_completion_tokens) generationConfig.maxOutputTokens = request.max_completion_tokens
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]
  }

  const thinkingConfig = buildThinkingConfig(
    request.model,
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeThinkingModel(effectiveModel)) {
      const currentMax = (generationConfig.maxOutputTokens as number | undefined) ?? 8192
      const requiredMax = thinkingConfig.thinkingBudget + 4096
      if (currentMax <= thinkingConfig.thinkingBudget) {
        generationConfig.maxOutputTokens = requiredMax
      }
    }
  }

  const geminiRequest: Record<string, unknown> = {
    contents,
    generationConfig,
  }
  if (systemInstruction) geminiRequest.systemInstruction = systemInstruction
  if (tools) geminiRequest.tools = tools

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...geminiRequest, sessionId: generateRequestId() },
  }

  const shouldIncludeThoughts = request.include_thoughts ?? thinkingConfig?.includeThoughts ?? false
  
  if (isClaudeThinkingModel(effectiveModel) && shouldIncludeThoughts) {
    return collectStreamingResponse(wrappedBody, accessToken, request.model, shouldIncludeThoughts)
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

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Antigravity API error: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as AntigravityResponse
  const completionId = generateCompletionId()
  const created = Math.floor(Date.now() / 1000)

  return convertGeminiToOpenAI(data, request.model, completionId, created, shouldIncludeThoughts)
}

export async function handleChatCompletionStream(
  request: ChatCompletionRequest,
  accessToken: string,
  projectId: string
): Promise<ReadableStream<Uint8Array>> {
  const effectiveModel = resolveModelName(request.model)
  const { contents, systemInstruction } = convertMessagesToGemini(request.messages)
  const tools = convertToolsToGemini(request.tools)

  const generationConfig: Record<string, unknown> = {}
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.max_tokens) generationConfig.maxOutputTokens = request.max_tokens
  if (request.max_completion_tokens) generationConfig.maxOutputTokens = request.max_completion_tokens
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]
  }

  const thinkingConfig = buildThinkingConfig(
    request.model,
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeThinkingModel(effectiveModel)) {
      const currentMax = (generationConfig.maxOutputTokens as number | undefined) ?? 8192
      const requiredMax = thinkingConfig.thinkingBudget + 4096
      if (currentMax <= thinkingConfig.thinkingBudget) {
        generationConfig.maxOutputTokens = requiredMax
      }
    }
  }

  const geminiRequest: Record<string, unknown> = {
    contents,
    generationConfig,
  }
  if (systemInstruction) geminiRequest.systemInstruction = systemInstruction
  if (tools) geminiRequest.tools = tools

  const wrappedBody = {
    project: projectId,
    model: effectiveModel,
    userAgent: 'antigravity',
    requestId: generateRequestId(),
    request: { ...geminiRequest, sessionId: generateRequestId() },
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

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Antigravity API error: ${response.status} - ${errorText}`)
  }

  const completionId = generateCompletionId()
  const created = Math.floor(Date.now() / 1000)
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const shouldIncludeThoughts = request.include_thoughts ?? thinkingConfig?.includeThoughts ?? false
  let isFirstChunk = true
  let isFirstThought = true
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

          const geminiData = parsed as AntigravityResponse
          const responseObj = geminiData.response
          const candidate = responseObj?.candidates?.[0]
          const parts = candidate?.content?.parts ?? []

          for (const part of parts) {
            if (part.text) {
              if (part.thought && shouldIncludeThoughts) {
                const chunk: ChatCompletionChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created,
                  model: request.model,
                  choices: [{
                    index: 0,
                    delta: isFirstThought 
                      ? { role: 'assistant', reasoning_content: part.text } 
                      : { reasoning_content: part.text },
                    finish_reason: null,
                    logprobs: null,
                  }],
                }
                isFirstThought = false
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
              } else if (!part.thought) {
                const chunk: ChatCompletionChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created,
                  model: request.model,
                  choices: [{
                    index: 0,
                    delta: isFirstChunk ? { role: 'assistant', content: part.text } : { content: part.text },
                    finish_reason: null,
                    logprobs: null,
                  }],
                }
                isFirstChunk = false
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
              }
            }

            if (part.functionCall) {
              const chunk: ChatCompletionChunk = {
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: request.model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: 0,
                      id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
                      type: 'function',
                      function: {
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args),
                      },
                    }],
                  },
                  finish_reason: null,
                  logprobs: null,
                }],
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            }
          }

          if (candidate?.finishReason) {
            const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
              STOP: 'stop',
              MAX_TOKENS: 'length',
              SAFETY: 'content_filter',
            }
            const finishReason = finishReasonMap[candidate.finishReason] ?? 'stop'

            const finalChunk: ChatCompletionChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: request.model,
              choices: [{
                index: 0,
                delta: {},
                finish_reason: finishReason,
                logprobs: null,
              }],
              usage: responseObj?.usageMetadata ? {
                prompt_tokens: responseObj.usageMetadata.promptTokenCount ?? 0,
                completion_tokens: responseObj.usageMetadata.candidatesTokenCount ?? 0,
                total_tokens: responseObj.usageMetadata.totalTokenCount ?? 0,
              } : null,
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`))
          }
        } catch {
          // Skip invalid JSON
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  })

  return response.body!.pipeThrough(transformStream)
}

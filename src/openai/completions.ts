import { apiRequest } from '../shared/fetch-with-fallback'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from './schemas'
import {
  type RateLimitInfo,
  extractRateLimitInfo,
} from '../shared/rate-limit'
import {
  generateRequestId,
  generateCompletionId,
  generateToolCallId,
  isInToolLoop,
  hasThinkingInHistory,
} from '../shared/utils'
import { convertOpenAIMessagesToGemini, convertOpenAIToolsToGemini, type OpenAIMessage } from '../shared/gemini-converter'
import type { AntigravityResponse } from '../shared/gemini-types'
import { THINKING_OUTPUT_BUFFER } from '../shared/constants'

export { extractRateLimitInfo, type RateLimitInfo }

const MODEL_ALIASES: Record<string, string> = {
  'gemini-3-pro-preview': 'gemini-3-pro-low',
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
}

function resolveModelName(model: string): string {
  return MODEL_ALIASES[model] ?? model
}

type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'
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
  return model.includes('gemini-3')
}

function isGemini3FlashModel(model: string): boolean {
  return model.includes('gemini-3-flash')
}

function isGemini25Model(model: string): boolean {
  return model.includes('gemini-2.5') || model.includes('gemini-2')
}

function isClaudeModel(model: string): boolean {
  return model.includes('claude')
}

function buildThinkingConfig(
  effectiveModel: string,
  reasoningEffort?: ReasoningEffort,
  thinkingBudget?: number,
  includeThoughts?: boolean
): ThinkingConfig | undefined {
  if (reasoningEffort === 'none' && !thinkingBudget) {
    return undefined
  }

  const config: ThinkingConfig = {}

  if (isGemini3Model(effectiveModel)) {
    if (thinkingBudget !== undefined) {
      config.thinkingBudget = thinkingBudget
    } else if (reasoningEffort && reasoningEffort !== 'none') {
      if (isGemini3FlashModel(effectiveModel)) {
        config.thinkingLevel = reasoningEffort as ThinkingLevel
      } else {
        config.thinkingLevel = reasoningEffort === 'low' ? 'low' : 'high'
      }
    }
  } else if (isGemini25Model(effectiveModel) || isClaudeModel(effectiveModel)) {
    if (thinkingBudget !== undefined) {
      config.thinkingBudget = thinkingBudget
    } else if (reasoningEffort && reasoningEffort !== 'none') {
      config.thinkingBudget = THINKING_BUDGET_MAP[reasoningEffort]
    }
  }

  if (Object.keys(config).length === 0) {
    return undefined
  }

  config.includeThoughts = includeThoughts ?? true

  return config
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
  let thoughtSignature: string | undefined
  const toolCalls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
    thought_signature?: string
  }> = []

  for (const part of parts) {
    if (part.text) {
      if (part.thought) {
        reasoningContent = (reasoningContent ?? '') + part.text
        if (part.thoughtSignature) {
          thoughtSignature = part.thoughtSignature
        }
      } else {
        content = (content ?? '') + part.text
      }
    }
    if (part.functionCall) {
      const toolCall: typeof toolCalls[0] = {
        id: generateToolCallId(),
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        },
      }
      if (part.thoughtSignature) {
        toolCall.thought_signature = part.thoughtSignature
      }
      toolCalls.push(toolCall)
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
        thought_signature: includeThoughts && thoughtSignature ? thoughtSignature : undefined,
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
): Promise<ChatCompletionResponse | Response> {
  const response = await apiRequest({
    path: '/v1internal:streamGenerateContent?alt=sse',
    body: wrappedBody,
    accessToken,
    stream: true,
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(errorText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as ChatCompletionResponse
  }

  const completionId = generateCompletionId()
  const created = Math.floor(Date.now() / 1000)
  const decoder = new TextDecoder()

  let content = ''
  let reasoningContent = ''
  let thoughtSignature = ''
  let finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' = 'stop'
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined
  const toolCalls: ChatCompletionResponse['choices'][0]['message']['tool_calls'] = []

  if (!response.body) {
    return {
      id: completionId,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: null, refusal: null },
        finish_reason: 'stop',
        logprobs: null,
      }],
    }
  }

  const reader = response.body.getReader()
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
              if (part.thoughtSignature) {
                thoughtSignature = part.thoughtSignature
              }
            } else {
              content += part.text
            }
          }
          if (part.functionCall) {
            const tc: NonNullable<ChatCompletionResponse['choices'][0]['message']['tool_calls']>[0] = {
              id: generateToolCallId(),
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            }
            if (part.thoughtSignature) {
              tc.thought_signature = part.thoughtSignature
            }
            toolCalls.push(tc)
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
      } catch (e) {
        console.error('[stream parse]', e)
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
        thought_signature: includeThoughts && thoughtSignature ? thoughtSignature : undefined,
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
): Promise<ChatCompletionResponse | Response> {
  const effectiveModel = resolveModelName(request.model)
  
  const { contents, systemInstruction } = convertOpenAIMessagesToGemini(request.messages as OpenAIMessage[])
  const tools = convertOpenAIToolsToGemini(request.tools)

  const inToolLoop = isInToolLoop(contents)
  const hasThinking = hasThinkingInHistory(contents)
  
  let thinkingConfig = buildThinkingConfig(
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  if (thinkingConfig && inToolLoop && !hasThinking) {
    thinkingConfig = undefined
  }

  const generationConfig: Record<string, unknown> = {}
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.max_tokens) generationConfig.maxOutputTokens = request.max_tokens
  if (request.max_completion_tokens) generationConfig.maxOutputTokens = request.max_completion_tokens
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]
  }

  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeModel(effectiveModel)) {
      const currentMax = (generationConfig.maxOutputTokens as number | undefined) ?? 8192
      const requiredMax = thinkingConfig.thinkingBudget + THINKING_OUTPUT_BUFFER
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
  
  if (isClaudeModel(effectiveModel) && shouldIncludeThoughts) {
    return collectStreamingResponse(wrappedBody, accessToken, request.model, shouldIncludeThoughts)
  }

  const response = await apiRequest({
    path: '/v1internal:generateContent',
    body: wrappedBody,
    accessToken,
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(errorText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    }) as unknown as ChatCompletionResponse
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
): Promise<ReadableStream<Uint8Array> | Response> {
  const effectiveModel = resolveModelName(request.model)
  
  const { contents, systemInstruction } = convertOpenAIMessagesToGemini(request.messages as OpenAIMessage[])
  const tools = convertOpenAIToolsToGemini(request.tools)

  const inToolLoop = isInToolLoop(contents)
  const hasThinking = hasThinkingInHistory(contents)
  
  let thinkingConfig = buildThinkingConfig(
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  if (thinkingConfig && inToolLoop && !hasThinking) {
    thinkingConfig = undefined
  }

  const generationConfig: Record<string, unknown> = {}
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.max_tokens) generationConfig.maxOutputTokens = request.max_tokens
  if (request.max_completion_tokens) generationConfig.maxOutputTokens = request.max_completion_tokens
  if (request.stop) {
    generationConfig.stopSequences = Array.isArray(request.stop) ? request.stop : [request.stop]
  }

  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeModel(effectiveModel)) {
      const currentMax = (generationConfig.maxOutputTokens as number | undefined) ?? 8192
      const requiredMax = thinkingConfig.thinkingBudget + THINKING_OUTPUT_BUFFER
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

  const response = await apiRequest({
    path: '/v1internal:streamGenerateContent?alt=sse',
    body: wrappedBody,
    accessToken,
    stream: true,
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(errorText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!response.body) {
    return new Response('No response body', { status: 500 })
  }

  const completionId = generateCompletionId()
  const created = Math.floor(Date.now() / 1000)
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const shouldIncludeThoughts = request.include_thoughts ?? thinkingConfig?.includeThoughts ?? false
  let isFirstChunk = true
  let isFirstThought = true
  let buffer = ''
  let toolCallIndex = 0
  let hasToolCalls = false

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
              hasToolCalls = true
              const toolCallId = part.functionCall.id ?? generateToolCallId()
              const toolCallDelta = {
                index: toolCallIndex,
                id: toolCallId,
                type: 'function' as const,
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args),
                },
                thought_signature: part.thoughtSignature,
              }
              const chunk: ChatCompletionChunk = {
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: request.model,
                choices: [{
                  index: 0,
                  delta: {
                    role: 'assistant',
                    tool_calls: [toolCallDelta],
                  },
                  finish_reason: null,
                  logprobs: null,
                }],
              }
              toolCallIndex++
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            }
          }

          if (candidate?.finishReason) {
            const finishReasonMap: Record<string, 'stop' | 'length' | 'tool_calls' | 'content_filter'> = {
              STOP: 'stop',
              MAX_TOKENS: 'length',
              SAFETY: 'content_filter',
            }
            let finishReason = finishReasonMap[candidate.finishReason] ?? 'stop'
            if (hasToolCalls) finishReason = 'tool_calls'

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
        } catch (e) {
          console.error('[stream parse]', e)
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  })

  return response.body.pipeThrough(transformStream)
}

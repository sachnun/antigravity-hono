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

export interface RateLimitInfo {
  isRateLimited: boolean
  retryDelayMs: number | null
  errorText: string | null
}

function parseRateLimitError(text: string): string | null {
  try {
    const data = JSON.parse(text)
    const details = data.error?.details ?? []
    for (const detail of details) {
      if (detail.retryDelay) {
        return detail.retryDelay
      }
    }
    if (data.error?.quotaResetDelay) {
      return data.error.quotaResetDelay
    }
  } catch {}
  return null
}

function parseDelaySeconds(delay: string): number {
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

const MODEL_ALIASES: Record<string, string> = {
  'gemini-3-pro-preview': 'gemini-3-pro-low',
  'claude-opus-4-5': 'claude-opus-4-5-thinking',
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
      config.thinkingLevel = reasoningEffort as ThinkingLevel
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

interface GeminiContent {
  role: string
  parts: Array<{ 
    text?: string
    thought?: boolean
    thoughtSignature?: string
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

function isInToolLoop(contents: GeminiContent[]): boolean {
  if (contents.length === 0) return false
  const lastMsg = contents[contents.length - 1]
  if (lastMsg.role !== 'user') return false
  return lastMsg.parts.some(p => p.functionResponse !== undefined)
}

function hasValidThoughtSignature(contents: GeminiContent[]): boolean {
  for (let i = contents.length - 1; i >= 0; i--) {
    const msg = contents[i]
    if (msg.role === 'model') {
      for (const part of msg.parts) {
        if (part.functionCall && part.thoughtSignature && part.thoughtSignature !== 'skip_thought_signature_validator') {
          return true
        }
      }
      break
    }
  }
  return false
}

function convertMessagesToGemini(messages: Message[]): { contents: GeminiContent[]; systemInstruction?: { parts: Array<{ text: string }> } } {
  const contents: GeminiContent[] = []
  let systemInstruction: { parts: Array<{ text: string }> } | undefined

  const toolIdToName: Record<string, string> = {}
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type === 'function') {
          toolIdToName[tc.id] = tc.function.name
        }
      }
    }
  }

  let pendingToolParts: GeminiContent['parts'] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      const text = typeof msg.content === 'string' ? msg.content : msg.content?.map(p => p.text).filter(Boolean).join('\n') ?? ''
      systemInstruction = { parts: [{ text }] }
      continue
    }

    if (pendingToolParts.length > 0 && msg.role !== 'tool') {
      contents.push({ role: 'user', parts: pendingToolParts })
      pendingToolParts = []
    }

    if (msg.role === 'tool' && msg.tool_call_id) {
      let parsedContent: unknown
      if (typeof msg.content === 'string') {
        try {
          parsedContent = JSON.parse(msg.content)
        } catch {
          parsedContent = msg.content
        }
      } else {
        parsedContent = msg.content
      }
      const funcName = toolIdToName[msg.tool_call_id] ?? msg.name ?? 'unknown_function'
      pendingToolParts.push({
        functionResponse: {
          name: funcName,
          response: { result: parsedContent },
          id: msg.tool_call_id,
        },
      })
      continue
    }

    const role = msg.role === 'assistant' ? 'model' : 'user'
    const parts: GeminiContent['parts'] = []

    if (typeof msg.content === 'string' && msg.content) {
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
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments)
        } catch {}
        const funcPart: GeminiContent['parts'][0] = {
          functionCall: {
            name: tc.function.name,
            args,
            id: tc.id,
          },
        }
        if (tc.thought_signature) {
          funcPart.thoughtSignature = tc.thought_signature
        }
        parts.push(funcPart)
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts })
    }
  }

  if (pendingToolParts.length > 0) {
    contents.push({ role: 'user', parts: pendingToolParts })
  }

  return { contents, systemInstruction }
}

const UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', '$vocabulary',
  'definitions', 'propertyNames', 'additionalProperties', 'additionalItems',
  'unevaluatedProperties', 'unevaluatedItems', 'contentEncoding', 'contentMediaType',
  'contentSchema', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'not',
  'minContains', 'maxContains', 'dependentRequired', 'dependentSchemas',
  'prefixItems', 'contains', 'patternProperties', 'const', 'deprecated',
  'minItems', 'maxItems', 'pattern', 'minLength', 'maxLength',
  'minimum', 'maximum', 'default', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'format', 'minProperties', 'maxProperties', 'uniqueItems',
  'readOnly', 'writeOnly', 'examples', 'title',
])

const VALID_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'])

function inlineSchemaRefs(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema
  
  const defs = (schema.$defs ?? schema.definitions ?? {}) as Record<string, unknown>
  if (!defs || Object.keys(defs).length === 0) return schema

  const resolve = (node: unknown, seen: Set<string> = new Set()): unknown => {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(item => resolve(item, seen))
    
    const obj = node as Record<string, unknown>
    
    if ('$ref' in obj && typeof obj.$ref === 'string') {
      const ref = obj.$ref
      if (seen.has(ref)) {
        const result: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
          if (k !== '$ref') result[k] = resolve(v, seen)
        }
        return result
      }
      
      for (const prefix of ['#/$defs/', '#/definitions/']) {
        if (ref.startsWith(prefix)) {
          const name = ref.slice(prefix.length)
          if (name in defs) {
            const newSeen = new Set(seen)
            newSeen.add(ref)
            return resolve(JSON.parse(JSON.stringify(defs[name])), newSeen)
          }
        }
      }
      
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k !== '$ref') result[k] = resolve(v, seen)
      }
      return result
    }
    
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolve(v, seen)
    }
    return result
  }
  
  return resolve(schema) as Record<string, unknown>
}

function cleanSchema(obj: unknown, depth = 0): unknown {
  if (depth > 20) return obj
  if (obj === null || obj === undefined) return undefined
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    const cleaned = obj.map(item => cleanSchema(item, depth + 1)).filter(x => x !== undefined)
    return cleaned.length > 0 ? cleaned : undefined
  }
  
  const input = obj as Record<string, unknown>
  const result: Record<string, unknown> = {}

  if ('anyOf' in input && Array.isArray(input.anyOf) && input.anyOf.length > 0) {
    const firstOption = cleanSchema(input.anyOf[0], depth + 1)
    if (firstOption && typeof firstOption === 'object') {
      return firstOption
    }
  }

  if ('oneOf' in input && Array.isArray(input.oneOf) && input.oneOf.length > 0) {
    const firstOption = cleanSchema(input.oneOf[0], depth + 1)
    if (firstOption && typeof firstOption === 'object') {
      return firstOption
    }
  }

  if ('const' in input) {
    result.enum = [input.const]
  }
  
  for (const [key, value] of Object.entries(input)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue
    if (key === 'const') continue
    if (value === undefined || value === null) continue
    
    if (key === 'type') {
      if (typeof value === 'string' && VALID_TYPES.has(value)) {
        result[key] = value
      } else if (Array.isArray(value)) {
        const validTypes = value.filter(t => typeof t === 'string' && VALID_TYPES.has(t))
        if (validTypes.length === 1) {
          result[key] = validTypes[0]
        } else if (validTypes.length > 1) {
          result[key] = validTypes[0]
        }
      }
      continue
    }
    
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      const cleanedProps: Record<string, unknown> = {}
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        const cleanedProp = cleanSchema(propValue, depth + 1)
        if (cleanedProp && typeof cleanedProp === 'object' && Object.keys(cleanedProp as object).length > 0) {
          cleanedProps[propKey] = cleanedProp
        }
      }
      if (Object.keys(cleanedProps).length > 0) {
        result[key] = cleanedProps
      }
      continue
    }
    
    if (key === 'items') {
      const cleanedItems = cleanSchema(value, depth + 1)
      if (cleanedItems && typeof cleanedItems === 'object' && Object.keys(cleanedItems as object).length > 0) {
        result[key] = cleanedItems
      }
      continue
    }
    
    const cleaned = cleanSchema(value, depth + 1)
    if (cleaned !== undefined) {
      result[key] = cleaned
    }
  }
  
  return Object.keys(result).length > 0 ? result : undefined
}

function ensureObjectSchema(params: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!params) return { type: 'object', properties: {} }
  const inlined = inlineSchemaRefs(params)
  const cleaned = cleanSchema(inlined) as Record<string, unknown> | undefined
  if (!cleaned) return { type: 'object', properties: {} }
  if (cleaned.type === 'object') return cleaned
  return { type: 'object', ...cleaned }
}

function convertToolsToGemini(tools: ChatCompletionRequest['tools']): GeminiTool[] | undefined {
  if (!tools?.length) return undefined

  const functionDeclarations = tools.map((tool) => ({
    name: /^\d/.test(tool.function.name) ? `t_${tool.function.name}` : tool.function.name,
    description: tool.function.description,
    parameters: ensureObjectSchema(tool.function.parameters as Record<string, unknown>),
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
        functionCall?: { name: string; args: Record<string, unknown>; id?: string } 
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
      } else {
        content = (content ?? '') + part.text
      }
    }
    if (part.functionCall) {
      const toolCall: typeof toolCalls[0] = {
        id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
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
): Promise<ChatCompletionResponse | Response> {
  const effectiveModel = resolveModelName(request.model)
  
  const thinkingConfig = buildThinkingConfig(
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  const thinkingEnabled = thinkingConfig !== null
  
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

  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeModel(effectiveModel)) {
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
  
  if (isClaudeModel(effectiveModel) && shouldIncludeThoughts) {
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
  
  const thinkingConfig = buildThinkingConfig(
    effectiveModel,
    request.reasoning_effort,
    request.thinking_budget,
    request.include_thoughts
  )
  const thinkingEnabled = thinkingConfig !== null
  
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

  if (thinkingConfig) {
    generationConfig.thinkingConfig = thinkingConfig
    if (thinkingConfig.thinkingBudget && isClaudeModel(effectiveModel)) {
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
    return new Response(errorText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
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
              const toolCallId = part.functionCall.id ?? `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
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

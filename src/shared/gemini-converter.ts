import type { GeminiContent, GeminiTool } from './gemini-types'
import { ensureObjectSchema } from './schema-utils'

export interface OpenAIMessage {
  role: string
  content?: string | Array<{ type: string; text?: string }>
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: string
    function: { name: string; arguments: string }
    thought_signature?: string
  }>
}

export interface AnthropicMessage {
  role: string
  content: string | Array<{
    type: string
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
    tool_use_id?: string
    content?: string | unknown
    thinking?: string
    signature?: string
    data?: string
    source?: { type: string; media_type?: string; data?: string }
  }>
}

export interface OpenAITool {
  type: string
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

export interface ConvertedMessages {
  contents: GeminiContent[]
  systemInstruction?: { parts: Array<{ text: string }> }
}

export function convertOpenAIMessagesToGemini(messages: OpenAIMessage[]): ConvertedMessages {
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
      const text = typeof msg.content === 'string' 
        ? msg.content 
        : msg.content?.map(p => p.text).filter(Boolean).join('\n') ?? ''
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

export function convertAnthropicMessagesToGemini(messages: AnthropicMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []
  const toolIdToName: Record<string, string> = {}

  for (const msg of messages) {
    if (typeof msg.content !== 'string') {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id && block.name) {
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
        if (block.type === 'text' && block.text) {
          if (pendingToolResults.length > 0) {
            contents.push({ role: 'user', parts: pendingToolResults })
            pendingToolResults = []
          }
          parts.push({ text: block.text })
        } else if (block.type === 'image' && block.source) {
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
        } else if (block.type === 'tool_use' && block.name && block.id) {
          const funcPart: GeminiContent['parts'][0] = {
            functionCall: {
              name: block.name,
              args: block.input as Record<string, unknown>,
              id: block.id,
            },
          }
          parts.push(funcPart)
        } else if (block.type === 'tool_result' && block.tool_use_id) {
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
        } else if (block.type === 'thinking' && block.thinking) {
          parts.push({
            text: block.thinking,
            thought: true,
            thoughtSignature: block.signature,
          })
        } else if (block.type === 'redacted_thinking' && block.data) {
          parts.push({
            text: '',
            thought: true,
            thoughtSignature: block.data,
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

export function convertOpenAIToolsToGemini(tools?: OpenAITool[]): GeminiTool[] | undefined {
  if (!tools?.length) return undefined

  const functionDeclarations = tools.map((tool) => ({
    name: /^\d/.test(tool.function.name) ? `t_${tool.function.name}` : tool.function.name,
    description: tool.function.description,
    parameters: ensureObjectSchema(tool.function.parameters as Record<string, unknown>),
  }))

  return [{ functionDeclarations }]
}

export function convertAnthropicToolsToGemini(tools?: AnthropicTool[]): GeminiTool[] | undefined {
  if (!tools?.length) return undefined
  return [{
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: ensureObjectSchema(tool.input_schema as Record<string, unknown>),
    })),
  }]
}

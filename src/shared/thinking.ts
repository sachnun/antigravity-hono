import type { GeminiContent } from './gemini-types'

export function isInToolLoop(contents: GeminiContent[]): boolean {
  if (contents.length === 0) return false
  const lastMsg = contents[contents.length - 1]
  if (lastMsg.role !== 'user') return false
  return lastMsg.parts.some(p => p.functionResponse !== undefined)
}

export function hasTurnStartThinking(contents: GeminiContent[]): boolean {
  let lastRealUserIdx = -1
  for (let i = 0; i < contents.length; i++) {
    const msg = contents[i]
    if (msg.role === 'user') {
      const isToolResult = msg.parts.some(p => p.functionResponse !== undefined)
      if (!isToolResult) lastRealUserIdx = i
    }
  }
  
  for (let i = lastRealUserIdx + 1; i < contents.length; i++) {
    if (contents[i].role === 'model') {
      return contents[i].parts.some(p => p.thought === true)
    }
  }
  return false
}

export function hasValidThoughtSignature(contents: GeminiContent[]): boolean {
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

export function sanitizeThinkingForClaude(contents: GeminiContent[], thinkingEnabled: boolean): GeminiContent[] {
  if (!thinkingEnabled) return contents
  
  const inToolLoop = isInToolLoop(contents)
  if (!inToolLoop) return contents
  
  const hasThinking = hasTurnStartThinking(contents)
  if (hasThinking) return contents
  
  const hasSignature = hasValidThoughtSignature(contents)
  if (hasSignature) return contents
  
  let toolResultCount = 0
  for (let i = contents.length - 1; i >= 0; i--) {
    const msg = contents[i]
    if (msg.role === 'user') {
      const funcResponses = msg.parts.filter(p => p.functionResponse !== undefined)
      if (funcResponses.length > 0) {
        toolResultCount += funcResponses.length
      } else {
        break
      }
    } else if (msg.role === 'model') {
      break
    }
  }
  
  const syntheticModelContent = toolResultCount <= 1 
    ? '[Tool execution completed.]' 
    : `[${toolResultCount} tool executions completed.]`
  
  return [
    ...contents,
    { role: 'model', parts: [{ text: syntheticModelContent }] },
    { role: 'user', parts: [{ text: '[Continue]' }] },
  ]
}

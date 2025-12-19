export function generateRequestId(): string {
  return crypto.randomUUID()
}

export function generateCompletionId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function generateMessageId(): string {
  return `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function generateToolCallId(): string {
  return `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function generateToolUseId(): string {
  return `toolu_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

export function isInToolLoop(contents: Array<{ role: string; parts: Array<{ functionResponse?: unknown }> }>): boolean {
  if (contents.length === 0) return false
  const lastMsg = contents[contents.length - 1]
  if (lastMsg.role !== 'user') return false
  return lastMsg.parts.some(p => p.functionResponse !== undefined)
}

export function hasThinkingInHistory(contents: Array<{ role: string; parts: Array<{ thought?: boolean }> }>): boolean {
  for (const msg of contents) {
    if (msg.role === 'model') {
      for (const part of msg.parts) {
        if (part.thought === true) return true
      }
    }
  }
  return false
}

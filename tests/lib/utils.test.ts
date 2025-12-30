import { describe, expect, test } from 'bun:test'
import {
  generateRequestId,
  generateCompletionId,
  generateMessageId,
  generateToolCallId,
  generateToolUseId,
  isInToolLoop,
  hasThinkingInHistory,
  safeCompare,
} from '../../src/lib/utils'

describe('generateRequestId', () => {
  test('returns valid UUID format', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })
})

describe('generateCompletionId', () => {
  test('returns chatcmpl- prefixed ID', () => {
    const id = generateCompletionId()
    expect(id).toMatch(/^chatcmpl-[a-f0-9]{24}$/)
  })
})

describe('generateMessageId', () => {
  test('returns msg_ prefixed ID', () => {
    const id = generateMessageId()
    expect(id).toMatch(/^msg_[a-f0-9]{24}$/)
  })
})

describe('generateToolCallId', () => {
  test('returns call_ prefixed ID', () => {
    const id = generateToolCallId()
    expect(id).toMatch(/^call_[a-f0-9]{24}$/)
  })
})

describe('generateToolUseId', () => {
  test('returns toolu_ prefixed ID', () => {
    const id = generateToolUseId()
    expect(id).toMatch(/^toolu_[a-f0-9]{24}$/)
  })
})

describe('isInToolLoop', () => {
  test('returns false for empty contents', () => {
    expect(isInToolLoop([])).toBe(false)
  })

  test('returns false when last message is not user', () => {
    expect(isInToolLoop([{ role: 'model', parts: [] }])).toBe(false)
  })

  test('returns false when user message has no functionResponse', () => {
    expect(isInToolLoop([{ role: 'user', parts: [{}] }])).toBe(false)
  })

  test('returns true when last user message has functionResponse', () => {
    expect(isInToolLoop([
      { role: 'user', parts: [{ functionResponse: { name: 'test', response: {} } }] }
    ])).toBe(true)
  })
})

describe('hasThinkingInHistory', () => {
  test('returns false for empty contents', () => {
    expect(hasThinkingInHistory([])).toBe(false)
  })

  test('returns false when no model messages have thought', () => {
    expect(hasThinkingInHistory([
      { role: 'user', parts: [{}] },
      { role: 'model', parts: [{ thought: false }] },
    ])).toBe(false)
  })

  test('returns true when model message has thought=true', () => {
    expect(hasThinkingInHistory([
      { role: 'model', parts: [{ thought: true }] },
    ])).toBe(true)
  })

  test('ignores user messages with thought', () => {
    expect(hasThinkingInHistory([
      { role: 'user', parts: [{ thought: true }] },
    ])).toBe(false)
  })
})

describe('safeCompare', () => {
  test('returns true for equal strings', () => {
    expect(safeCompare('hello', 'hello')).toBe(true)
  })

  test('returns false for different strings', () => {
    expect(safeCompare('hello', 'world')).toBe(false)
  })

  test('returns false for different lengths', () => {
    expect(safeCompare('hello', 'hello!')).toBe(false)
  })

  test('returns true for empty strings', () => {
    expect(safeCompare('', '')).toBe(true)
  })
})

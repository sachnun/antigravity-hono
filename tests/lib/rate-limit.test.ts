import { describe, expect, test } from 'bun:test'
import {
  parseRateLimitError,
  parseDelaySeconds,
  extractRateLimitInfo,
  parseRateLimitDelay,
} from '../../src/lib/rate-limit'

describe('parseRateLimitError', () => {
  test('extracts retryDelay from error details', () => {
    const text = JSON.stringify({
      error: {
        details: [{ retryDelay: '30s' }]
      }
    })
    expect(parseRateLimitError(text)).toBe('30s')
  })

  test('extracts quotaResetDelay from error', () => {
    const text = JSON.stringify({
      error: {
        quotaResetDelay: '60s'
      }
    })
    expect(parseRateLimitError(text)).toBe('60s')
  })

  test('returns null for invalid JSON', () => {
    expect(parseRateLimitError('not json')).toBe(null)
  })

  test('returns null when no delay found', () => {
    const text = JSON.stringify({ error: { message: 'rate limited' } })
    expect(parseRateLimitError(text)).toBe(null)
  })
})

describe('parseDelaySeconds', () => {
  test('parses seconds with s suffix', () => {
    expect(parseDelaySeconds('30s')).toBe(30)
  })

  test('parses seconds without suffix', () => {
    expect(parseDelaySeconds('30')).toBe(30)
  })

  test('parses float seconds', () => {
    expect(parseDelaySeconds('30.5s')).toBe(30.5)
  })

  test('returns 0 for invalid format', () => {
    expect(parseDelaySeconds('invalid')).toBe(0)
  })
})

describe('extractRateLimitInfo', () => {
  test('returns not rate limited for non-429 status', () => {
    const response = new Response('ok', { status: 200 })
    const result = extractRateLimitInfo(response, '')
    expect(result).toEqual({
      isRateLimited: false,
      retryDelayMs: null,
      errorText: null,
    })
  })

  test('returns rate limited with delay for 429', () => {
    const response = new Response('', { status: 429 })
    const errorText = JSON.stringify({
      error: { details: [{ retryDelay: '30s' }] }
    })
    const result = extractRateLimitInfo(response, errorText)
    expect(result).toEqual({
      isRateLimited: true,
      retryDelayMs: 30000,
      errorText,
    })
  })

  test('returns rate limited with null delay when no delay in error', () => {
    const response = new Response('', { status: 429 })
    const result = extractRateLimitInfo(response, '{}')
    expect(result).toEqual({
      isRateLimited: true,
      retryDelayMs: null,
      errorText: '{}',
    })
  })
})

describe('parseRateLimitDelay', () => {
  test('parses retryDelay from details', () => {
    const text = JSON.stringify({
      error: { details: [{ retryDelay: '30s' }] }
    })
    expect(parseRateLimitDelay(text)).toBe(30000)
  })

  test('parses quotaResetDelay', () => {
    const text = JSON.stringify({
      error: { quotaResetDelay: '60s' }
    })
    expect(parseRateLimitDelay(text)).toBe(60000)
  })

  test('returns null for invalid JSON', () => {
    expect(parseRateLimitDelay('not json')).toBe(null)
  })

  test('returns null when no delay found', () => {
    expect(parseRateLimitDelay('{}')).toBe(null)
  })
})

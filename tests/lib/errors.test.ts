import { describe, expect, test } from 'bun:test'
import {
  openaiError,
  anthropicError,
  OpenAIErrorTypes,
  AnthropicErrorTypes,
} from '../../src/lib/errors'

describe('openaiError', () => {
  test('creates error with default type', () => {
    const error = openaiError('Something went wrong')
    expect(error).toEqual({
      error: {
        message: 'Something went wrong',
        type: 'invalid_request_error',
        param: null,
        code: undefined,
      },
    })
  })

  test('creates error with custom type', () => {
    const error = openaiError('Auth failed', 'authentication_error')
    expect(error.error.type).toBe('authentication_error')
  })

  test('creates error with param', () => {
    const error = openaiError('Invalid model', 'invalid_request_error', 'model')
    expect(error.error.param).toBe('model')
  })

  test('creates error with code', () => {
    const error = openaiError('Rate limited', 'rate_limit_error', undefined, 'rate_limit_exceeded')
    expect(error.error.code).toBe('rate_limit_exceeded')
  })
})

describe('anthropicError', () => {
  test('creates error with default type', () => {
    const error = anthropicError('Something went wrong')
    expect(error).toEqual({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'Something went wrong',
      },
    })
  })

  test('creates error with custom type', () => {
    const error = anthropicError('Auth failed', 'authentication_error')
    expect(error.error.type).toBe('authentication_error')
  })
})

describe('error type constants', () => {
  test('OpenAIErrorTypes has expected values', () => {
    expect(OpenAIErrorTypes.INVALID_REQUEST).toBe('invalid_request_error')
    expect(OpenAIErrorTypes.AUTHENTICATION).toBe('authentication_error')
    expect(OpenAIErrorTypes.RATE_LIMIT).toBe('rate_limit_error')
    expect(OpenAIErrorTypes.SERVER).toBe('server_error')
  })

  test('AnthropicErrorTypes has expected values', () => {
    expect(AnthropicErrorTypes.INVALID_REQUEST).toBe('invalid_request_error')
    expect(AnthropicErrorTypes.AUTHENTICATION).toBe('authentication_error')
    expect(AnthropicErrorTypes.RATE_LIMIT).toBe('rate_limit_error')
    expect(AnthropicErrorTypes.API_ERROR).toBe('api_error')
  })
})

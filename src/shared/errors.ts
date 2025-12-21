export interface OpenAIError {
  error: {
    message: string
    type: string
    param?: string | null
    code?: string
  }
}

export interface AnthropicError {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

export function openaiError(
  message: string,
  type: string = 'invalid_request_error',
  param?: string,
  code?: string
): OpenAIError {
  return {
    error: {
      message,
      type,
      param: param ?? null,
      code,
    },
  }
}

export function anthropicError(
  message: string,
  type: string = 'invalid_request_error'
): AnthropicError {
  return {
    type: 'error',
    error: {
      type,
      message,
    },
  }
}

export const OpenAIErrorTypes = {
  INVALID_REQUEST: 'invalid_request_error',
  AUTHENTICATION: 'authentication_error',
  RATE_LIMIT: 'rate_limit_error',
  SERVER: 'server_error',
} as const

export const AnthropicErrorTypes = {
  INVALID_REQUEST: 'invalid_request_error',
  AUTHENTICATION: 'authentication_error',
  RATE_LIMIT: 'rate_limit_error',
  API_ERROR: 'api_error',
} as const

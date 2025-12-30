import { describe, expect, test } from 'bun:test'
import {
  ANTHROPIC_MODELS,
  resolveModelAlias,
  isValidAnthropicModel,
  listAnthropicModels,
  getAnthropicModel,
} from '../../src/anthropic/models'

describe('ANTHROPIC_MODELS', () => {
  test('contains expected models', () => {
    const modelIds = ANTHROPIC_MODELS.map(m => m.id)
    expect(modelIds).toContain('claude-sonnet-4-5')
    expect(modelIds).toContain('claude-opus-4-5')
  })
})

describe('resolveModelAlias', () => {
  test('resolves known alias', () => {
    expect(resolveModelAlias('claude-sonnet-4-5-20250929')).toBe('claude-sonnet-4-5')
    expect(resolveModelAlias('claude-4-sonnet')).toBe('claude-sonnet-4-5')
    expect(resolveModelAlias('claude-opus-4-5-20251101')).toBe('claude-opus-4-5')
    expect(resolveModelAlias('claude-4-opus')).toBe('claude-opus-4-5')
  })

  test('returns original for unknown model', () => {
    expect(resolveModelAlias('unknown-model')).toBe('unknown-model')
    expect(resolveModelAlias('claude-sonnet-4-5')).toBe('claude-sonnet-4-5')
  })
})

describe('isValidAnthropicModel', () => {
  test('returns true for valid model', () => {
    expect(isValidAnthropicModel('claude-sonnet-4-5')).toBe(true)
    expect(isValidAnthropicModel('claude-opus-4-5')).toBe(true)
  })

  test('returns true for valid alias', () => {
    expect(isValidAnthropicModel('claude-4-sonnet')).toBe(true)
    expect(isValidAnthropicModel('claude-sonnet-4-5-20250929')).toBe(true)
  })

  test('returns false for invalid model', () => {
    expect(isValidAnthropicModel('unknown-model')).toBe(false)
  })
})

describe('listAnthropicModels', () => {
  test('returns correct structure', () => {
    const result = listAnthropicModels()
    expect(result.data).toEqual(ANTHROPIC_MODELS)
    expect(result.has_more).toBe(false)
    expect(result.first_id).toBe(ANTHROPIC_MODELS[0]?.id ?? null)
    expect(result.last_id).toBe(ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1]?.id ?? null)
  })
})

describe('getAnthropicModel', () => {
  test('returns model when exists', () => {
    const model = getAnthropicModel('claude-sonnet-4-5')
    expect(model).not.toBeNull()
    expect(model?.id).toBe('claude-sonnet-4-5')
  })

  test('returns model for alias', () => {
    const model = getAnthropicModel('claude-4-sonnet')
    expect(model).not.toBeNull()
    expect(model?.id).toBe('claude-sonnet-4-5')
  })

  test('returns null for unknown model', () => {
    const model = getAnthropicModel('unknown-model')
    expect(model).toBeNull()
  })
})

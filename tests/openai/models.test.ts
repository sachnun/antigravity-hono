import { describe, expect, test } from 'bun:test'
import {
  AVAILABLE_MODELS,
  listModels,
  getModel,
  isValidModel,
} from '../../src/openai/models'

describe('AVAILABLE_MODELS', () => {
  test('contains expected models', () => {
    const modelIds = AVAILABLE_MODELS.map(m => m.id)
    expect(modelIds).toContain('gemini-3-pro-preview')
    expect(modelIds).toContain('gemini-2.5-flash')
    expect(modelIds).toContain('claude-sonnet-4-5')
  })
})

describe('listModels', () => {
  test('returns list with correct structure', () => {
    const result = listModels()
    expect(result.object).toBe('list')
    expect(result.data).toBeArray()
    expect(result.data.length).toBe(AVAILABLE_MODELS.length)
  })

  test('each model has required fields', () => {
    const result = listModels()
    for (const model of result.data) {
      expect(model).toHaveProperty('id')
      expect(model).toHaveProperty('object', 'model')
      expect(model).toHaveProperty('created')
      expect(model).toHaveProperty('owned_by')
    }
  })
})

describe('getModel', () => {
  test('returns model when exists', () => {
    const model = getModel('gemini-2.5-flash')
    expect(model).not.toBeNull()
    expect(model?.id).toBe('gemini-2.5-flash')
    expect(model?.object).toBe('model')
  })

  test('returns null for unknown model', () => {
    const model = getModel('unknown-model')
    expect(model).toBeNull()
  })
})

describe('isValidModel', () => {
  test('returns true for valid model', () => {
    expect(isValidModel('gemini-2.5-flash')).toBe(true)
  })

  test('returns false for invalid model', () => {
    expect(isValidModel('unknown-model')).toBe(false)
  })
})

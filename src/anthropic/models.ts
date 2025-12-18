import type { AnthropicModelInfo, AnthropicModelsListResponse } from './schemas'

export const ANTHROPIC_MODELS: AnthropicModelInfo[] = [
  {
    id: 'claude-sonnet-4-5',
    type: 'model',
    display_name: 'Claude Sonnet 4.5',
    created_at: '2025-09-29T00:00:00Z',
  },
  {
    id: 'claude-opus-4-5',
    type: 'model',
    display_name: 'Claude Opus 4.5',
    created_at: '2025-11-01T00:00:00Z',
  },
]

const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'claude-sonnet-4-5',
  'claude-4-sonnet': 'claude-sonnet-4-5',
  'claude-opus-4-5-20251101': 'claude-opus-4-5',
  'claude-4-opus': 'claude-opus-4-5',
}

export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model] ?? model
}

export function isValidAnthropicModel(modelId: string): boolean {
  const resolved = resolveModelAlias(modelId)
  return ANTHROPIC_MODELS.some((m) => m.id === resolved)
}

export function listAnthropicModels(): AnthropicModelsListResponse {
  return {
    data: ANTHROPIC_MODELS,
    has_more: false,
    first_id: ANTHROPIC_MODELS[0]?.id ?? null,
    last_id: ANTHROPIC_MODELS[ANTHROPIC_MODELS.length - 1]?.id ?? null,
  }
}

export function getAnthropicModel(modelId: string): AnthropicModelInfo | null {
  const resolved = resolveModelAlias(modelId)
  return ANTHROPIC_MODELS.find((m) => m.id === resolved) ?? null
}

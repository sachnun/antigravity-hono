export const AVAILABLE_MODELS = [
  {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    owned_by: 'google',
    created: 1700000000,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    owned_by: 'google',
    created: 1700000000,
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    owned_by: 'google',
    created: 1700000000,
  },
  {
    id: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    owned_by: 'anthropic',
    created: 1700000000,
  },
  {
    id: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    owned_by: 'anthropic',
    created: 1700000000,
  },
] as const

export function listModels() {
  return {
    object: 'list' as const,
    data: AVAILABLE_MODELS.map((m) => ({
      id: m.id,
      object: 'model' as const,
      created: m.created,
      owned_by: m.owned_by,
    })),
  }
}

export function getModel(modelId: string) {
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!model) return null

  return {
    id: model.id,
    object: 'model' as const,
    created: model.created,
    owned_by: model.owned_by,
  }
}

export function isValidModel(modelId: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === modelId)
}

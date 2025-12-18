import type { GeminiModel } from './schemas'

export const GEMINI_MODELS: GeminiModel[] = [
  {
    name: 'models/claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    description: 'Claude Sonnet 4.5 - balanced performance and speed',
    inputTokenLimit: 200000,
    outputTokenLimit: 64000,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
  {
    name: 'models/claude-opus-4-5',
    displayName: 'Claude Opus 4.5',
    description: 'Claude Opus 4.5 - highest capability with extended thinking',
    inputTokenLimit: 200000,
    outputTokenLimit: 64000,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
  {
    name: 'models/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Gemini 2.5 Flash - fast and efficient',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
  {
    name: 'models/gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    description: 'Gemini 2.5 Flash Lite - lightweight and fast',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
  {
    name: 'models/gemini-3-pro-preview',
    displayName: 'Gemini 3 Pro Preview',
    description: 'Gemini 3 Pro Preview - latest experimental model',
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
  {
    name: 'models/gpt-oss-120b-medium',
    displayName: 'GPT OSS 120B Medium',
    description: 'GPT OSS 120B - open source large model',
    inputTokenLimit: 128000,
    outputTokenLimit: 16384,
    supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
  },
]

const MODEL_NAME_SET = new Set(GEMINI_MODELS.map(m => m.name))
const SHORT_NAME_MAP = new Map(GEMINI_MODELS.map(m => [m.name.replace('models/', ''), m]))

export function listGeminiModels(): { models: GeminiModel[] } {
  return { models: GEMINI_MODELS }
}

export function getGeminiModel(modelId: string): GeminiModel | undefined {
  const normalized = modelId.replace(/^models\//, '')
  return SHORT_NAME_MAP.get(normalized)
}

export function isValidGeminiModel(modelId: string): boolean {
  const normalized = modelId.replace(/^models\//, '')
  return SHORT_NAME_MAP.has(normalized)
}

export function resolveGeminiModelName(modelId: string): string {
  return modelId.replace(/^models\//, '')
}

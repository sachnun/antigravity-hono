export interface GeminiContent {
  role: string
  parts: Array<{
    text?: string
    thought?: boolean
    thoughtSignature?: string
    inlineData?: { mimeType: string; data: string }
    functionCall?: { name: string; args: Record<string, unknown>; id?: string }
    functionResponse?: { name: string; response: unknown; id?: string }
  }>
}

export interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }>
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

export interface ThinkingConfig {
  thinkingLevel?: ThinkingLevel
  thinkingBudget?: number
  includeThoughts?: boolean
}

export interface GeminiGenerationConfig {
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  stopSequences?: string[]
  thinkingConfig?: ThinkingConfig
}

export interface GeminiRequest {
  contents: GeminiContent[]
  generationConfig?: GeminiGenerationConfig
  systemInstruction?: { parts: Array<{ text: string }> }
  tools?: GeminiTool[]
}

export interface AntigravityRequestBody {
  project: string
  model: string
  userAgent: string
  requestId: string
  request: GeminiRequest & { sessionId: string }
}

export interface AntigravityResponse {
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
          thought?: boolean
          thoughtSignature?: string
          functionCall?: { name: string; args: Record<string, unknown>; id?: string }
        }>
      }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
      cachedContentTokenCount?: number
      thoughtsTokenCount?: number
    }
  }
  error?: { code?: number; message?: string; status?: string }
}

export interface GeminiContentPart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  inlineData?: { mimeType: string; data: string }
  functionCall?: { name: string; args: Record<string, unknown>; id?: string }
  functionResponse?: { name: string; response: unknown; id?: string }
}

export interface GeminiContent {
  role: string
  parts: GeminiContentPart[]
}

export interface GeminiTool {
  functionDeclarations: Array<{
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }>
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

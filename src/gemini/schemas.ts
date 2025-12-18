import { z } from '@hono/zod-openapi'

const GeminiPartSchema = z.object({
  text: z.string().optional(),
  inlineData: z.object({
    mimeType: z.string(),
    data: z.string(),
  }).optional(),
  functionCall: z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }).optional(),
  functionResponse: z.object({
    name: z.string(),
    response: z.unknown(),
  }).optional(),
})

const GeminiContentSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(GeminiPartSchema),
})

const GeminiFunctionDeclarationSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
})

const GeminiToolSchema = z.object({
  functionDeclarations: z.array(GeminiFunctionDeclarationSchema).optional(),
})

const GeminiGenerationConfigSchema = z.object({
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  candidateCount: z.number().optional(),
  responseMimeType: z.string().optional(),
  thinkingConfig: z.object({
    thinkingBudget: z.number().optional(),
    thinkingLevel: z.enum(['low', 'medium', 'high']).optional(),
    includeThoughts: z.boolean().optional(),
  }).optional(),
})

const GeminiSafetySettingSchema = z.object({
  category: z.string(),
  threshold: z.string(),
})

export const GeminiGenerateContentRequestSchema = z.object({
  contents: z.array(GeminiContentSchema),
  systemInstruction: z.object({
    parts: z.array(z.object({ text: z.string() })),
  }).optional(),
  tools: z.array(GeminiToolSchema).optional(),
  generationConfig: GeminiGenerationConfigSchema.optional(),
  safetySettings: z.array(GeminiSafetySettingSchema).optional(),
})

const GeminiCandidateSchema = z.object({
  content: z.object({
    role: z.string(),
    parts: z.array(z.object({
      text: z.string().optional(),
      thought: z.boolean().optional(),
      thoughtSignature: z.string().optional(),
      functionCall: z.object({
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      }).optional(),
    })),
  }),
  finishReason: z.string().optional(),
  safetyRatings: z.array(z.object({
    category: z.string(),
    probability: z.string(),
  })).optional(),
  index: z.number().optional(),
})

const GeminiUsageMetadataSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
  thoughtsTokenCount: z.number().optional(),
  cachedContentTokenCount: z.number().optional(),
})

export const GeminiGenerateContentResponseSchema = z.object({
  candidates: z.array(GeminiCandidateSchema),
  usageMetadata: GeminiUsageMetadataSchema.optional(),
  modelVersion: z.string().optional(),
})

export const GeminiErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    status: z.string(),
  }),
})

export const GeminiModelSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  inputTokenLimit: z.number(),
  outputTokenLimit: z.number(),
  supportedGenerationMethods: z.array(z.string()),
})

export const GeminiModelsListResponseSchema = z.object({
  models: z.array(GeminiModelSchema),
})

export type GeminiGenerateContentRequest = z.infer<typeof GeminiGenerateContentRequestSchema>
export type GeminiGenerateContentResponse = z.infer<typeof GeminiGenerateContentResponseSchema>
export type GeminiContent = z.infer<typeof GeminiContentSchema>
export type GeminiPart = z.infer<typeof GeminiPartSchema>
export type GeminiModel = z.infer<typeof GeminiModelSchema>

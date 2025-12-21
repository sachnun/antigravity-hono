import { z } from '@hono/zod-openapi'

const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const ImageSourceSchema = z.object({
  type: z.enum(['base64', 'url']),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']).optional(),
  data: z.string().optional(),
  url: z.string().optional(),
})

const ImageContentBlockSchema = z.object({
  type: z.literal('image'),
  source: ImageSourceSchema,
})

const ToolUseContentBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
})

const ToolResultContentBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([
    z.string(),
    z.array(z.union([TextContentBlockSchema, ImageContentBlockSchema])),
  ]).optional(),
  is_error: z.boolean().optional(),
})

const ThinkingContentBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string(),
})

const RedactedThinkingContentBlockSchema = z.object({
  type: z.literal('redacted_thinking'),
  data: z.string(),
})

const ContentBlockSchema = z.union([
  TextContentBlockSchema,
  ImageContentBlockSchema,
  ToolUseContentBlockSchema,
  ToolResultContentBlockSchema,
  ThinkingContentBlockSchema,
  RedactedThinkingContentBlockSchema,
])

const MessageContentSchema = z.union([
  z.string(),
  z.array(ContentBlockSchema),
])

const MessageParamSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: MessageContentSchema,
})

const ToolInputSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: ToolInputSchemaSchema,
})

const ToolChoiceAutoSchema = z.object({
  type: z.literal('auto'),
  disable_parallel_tool_use: z.boolean().optional(),
})

const ToolChoiceAnySchema = z.object({
  type: z.literal('any'),
  disable_parallel_tool_use: z.boolean().optional(),
})

const ToolChoiceToolSchema = z.object({
  type: z.literal('tool'),
  name: z.string(),
  disable_parallel_tool_use: z.boolean().optional(),
})

const ToolChoiceNoneSchema = z.object({
  type: z.literal('none'),
})

const ToolChoiceSchema = z.union([
  ToolChoiceAutoSchema,
  ToolChoiceAnySchema,
  ToolChoiceToolSchema,
  ToolChoiceNoneSchema,
])

const ThinkingConfigEnabledSchema = z.object({
  type: z.literal('enabled'),
  budget_tokens: z.number().int().min(1024),
})

const ThinkingConfigDisabledSchema = z.object({
  type: z.literal('disabled'),
})

const ThinkingConfigSchema = z.union([
  ThinkingConfigEnabledSchema,
  ThinkingConfigDisabledSchema,
])

const SystemContentSchema = z.union([
  z.string(),
  z.array(z.object({
    type: z.literal('text'),
    text: z.string(),
  })),
])

export const AnthropicMessageRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageParamSchema),
  max_tokens: z.number().int().min(1),
  system: SystemContentSchema.optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().optional(),
  tools: z.array(ToolSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  thinking: ThinkingConfigSchema.optional(),
  metadata: z.object({
    user_id: z.string().optional(),
  }).optional(),
}).openapi('AnthropicMessageRequest')

const ResponseTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const ResponseThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string(),
})

const ResponseToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
})

const ResponseContentBlockSchema = z.union([
  ResponseTextBlockSchema,
  ResponseThinkingBlockSchema,
  ResponseToolUseBlockSchema,
])

const UsageSchema = z.object({
  input_tokens: z.number().int(),
  output_tokens: z.number().int(),
  cache_creation_input_tokens: z.number().int().optional(),
  cache_read_input_tokens: z.number().int().optional(),
})

export const AnthropicMessageResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(ResponseContentBlockSchema),
  model: z.string(),
  stop_reason: z.enum(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use']).nullable(),
  stop_sequence: z.string().nullable().optional(),
  usage: UsageSchema,
}).openapi('AnthropicMessageResponse')

export const AnthropicModelInfoSchema = z.object({
  id: z.string(),
  type: z.literal('model'),
  display_name: z.string(),
  created_at: z.string(),
}).openapi('AnthropicModelInfo')

export const AnthropicModelsListResponseSchema = z.object({
  data: z.array(AnthropicModelInfoSchema),
  has_more: z.boolean(),
  first_id: z.string().nullable(),
  last_id: z.string().nullable(),
}).openapi('AnthropicModelsListResponse')

export const AnthropicErrorSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }),
}).openapi('AnthropicError')

export type AnthropicMessageRequest = z.infer<typeof AnthropicMessageRequestSchema>
export type AnthropicMessageResponse = z.infer<typeof AnthropicMessageResponseSchema>
export type AnthropicModelInfo = z.infer<typeof AnthropicModelInfoSchema>
export type AnthropicModelsListResponse = z.infer<typeof AnthropicModelsListResponseSchema>
export type ContentBlock = z.infer<typeof ContentBlockSchema>
export type ResponseContentBlock = z.infer<typeof ResponseContentBlockSchema>

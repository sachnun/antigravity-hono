import { z } from '@hono/zod-openapi'

const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']).openapi({ example: 'user' }),
  content: z.union([
    z.string(),
    z.array(z.object({
      type: z.enum(['text', 'image_url']),
      text: z.string().optional(),
      image_url: z.object({ url: z.string() }).optional(),
    })),
  ]).nullable().optional().openapi({ example: 'Hello!' }),
  name: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
    thought_signature: z.string().optional(),
  })).optional(),
  tool_call_id: z.string().optional(),
})

const ToolFunctionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.any().optional(),
  strict: z.boolean().optional(),
})

const ToolSchema = z.object({
  type: z.literal('function'),
  function: ToolFunctionSchema,
}).openapi({
  example: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather in a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
        },
        required: ['location'],
      },
    },
  },
})

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(MessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  max_tokens: z.number().int().optional(),
  max_completion_tokens: z.number().int().optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  reasoning_effort: z.enum(['none', 'low', 'medium', 'high']).optional().openapi({
    description: 'Reasoning effort level for thinking models',
  }),
  thinking_budget: z.number().int().min(0).max(32000).optional().openapi({
    description: 'Explicit thinking budget in tokens (overrides reasoning_effort)',
  }),
  include_thoughts: z.boolean().optional().openapi({
    description: 'Include thinking/reasoning tokens in response (defaults to true when thinking is enabled)',
  }),
  tools: z.array(ToolSchema).optional(),
  tool_choice: z.union([
    z.enum(['none', 'auto', 'required']),
    z.object({
      type: z.literal('function'),
      function: z.object({ name: z.string() }),
    }),
  ]).optional(),
  response_format: z.object({
    type: z.enum(['text', 'json_object', 'json_schema']),
    json_schema: z.object({
      name: z.string(),
      schema: z.any(),
      strict: z.boolean().optional(),
    }).optional(),
  }).optional(),
}).openapi('ChatCompletionRequest', {
  example: {
    model: 'gemini-3-pro-preview',
    messages: [{ role: 'user', content: 'Hello!' }],
  },
})

const ChoiceMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.string().nullable(),
  reasoning_content: z.string().nullable().optional().openapi({
    description: 'Thinking/reasoning content from the model (when include_thoughts is true)',
  }),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
    thought_signature: z.string().optional(),
  })).optional(),
  refusal: z.string().nullable().optional(),
})

const ChoiceSchema = z.object({
  index: z.number().int(),
  message: ChoiceMessageSchema,
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']).nullable(),
  logprobs: z.null().optional(),
})

const UsageSchema = z.object({
  prompt_tokens: z.number().int(),
  completion_tokens: z.number().int(),
  total_tokens: z.number().int(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().int().optional(),
  }).optional(),
  completion_tokens_details: z.object({
    reasoning_tokens: z.number().int().optional(),
  }).optional(),
})

export const ChatCompletionResponseSchema = z.object({
  id: z.string().openapi({ example: 'chatcmpl-abc123' }),
  object: z.literal('chat.completion'),
  created: z.number().int().openapi({ example: 1700000000 }),
  model: z.string().openapi({ example: 'gemini-3-pro-preview' }),
  choices: z.array(ChoiceSchema),
  usage: UsageSchema.optional(),
  service_tier: z.string().optional(),
}).openapi('ChatCompletionResponse')

const DeltaSchema = z.object({
  role: z.enum(['assistant']).optional(),
  content: z.string().optional(),
  reasoning_content: z.string().optional().openapi({
    description: 'Thinking/reasoning content delta from the model',
  }),
  tool_calls: z.array(z.object({
    index: z.number().int(),
    id: z.string().optional(),
    type: z.literal('function').optional(),
    function: z.object({
      name: z.string().optional(),
      arguments: z.string().optional(),
    }).optional(),
  })).optional(),
})

const StreamChoiceSchema = z.object({
  index: z.number().int(),
  delta: DeltaSchema,
  finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']).nullable(),
  logprobs: z.null().optional(),
})

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(StreamChoiceSchema),
  usage: UsageSchema.optional().nullable(),
}).openapi('ChatCompletionChunk')

const ModelObjectSchema = z.object({
  id: z.string().openapi({ example: 'gemini-3-pro-preview' }),
  object: z.literal('model'),
  created: z.number().int().openapi({ example: 1700000000 }),
  owned_by: z.string().openapi({ example: 'google' }),
})

export const ModelsListResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(ModelObjectSchema),
}).openapi('ModelsListResponse')

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>
export type ChatCompletionResponse = z.infer<typeof ChatCompletionResponseSchema>
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>
export type Message = z.infer<typeof MessageSchema>

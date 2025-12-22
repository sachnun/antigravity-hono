import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { z } from '@hono/zod-openapi'
import {
  ErrorSchema,
} from './schemas'
import { authorizeAntigravity, exchangeAntigravity, refreshAccessToken } from './oauth'
import {
  handleChatCompletion,
  handleChatCompletionStream,
  listModels,
  getModel,
  isValidModel,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  ModelsListResponseSchema,
} from './openai'
import {
  handleAnthropicMessage,
  handleAnthropicMessageStream,
  isValidAnthropicModel,
  AnthropicMessageRequestSchema,
  AnthropicMessageResponseSchema,
  AnthropicErrorSchema,
} from './anthropic'
import { setStoredToken, handleTokenRefresh, getAllTokens, deleteStoredToken, getAllAccountsQuota, warmUpAllAccounts, type StoredToken } from './storage'
import { withTokenRotation, type TokenInfo } from './shared/token-rotation'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  ADMIN_KEY?: string
  API_KEY?: string
  ENVIRONMENT?: string
}

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.use('*', cors())

app.get('/auth/authorize', async (c) => {
  const redirectUri = c.req.query('redirectUri')
  const result = await authorizeAntigravity(redirectUri)
  return c.json(result)
})

app.post('/auth/exchange', async (c) => {
  const body = await c.req.json<{ code: string; state: string }>()
  const result = await exchangeAntigravity(body.code, body.state)
  return c.json(result)
})

app.post('/auth/refresh', async (c) => {
  const body = await c.req.json<{ refreshToken: string }>()
  const result = await refreshAccessToken(body.refreshToken)
  return c.json(result)
})

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'API Key for chat completions',
})

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Antigravity API',
    description: 'OpenAI-compatible API powered by Google Antigravity',
  },
  tags: [
    { name: 'OpenAI Compatible', description: 'OpenAI-compatible chat completions API' },
    { name: 'Anthropic Compatible', description: 'Anthropic-compatible messages API' },
  ],
})

const chatCompletionsRoute = createRoute({
  method: 'post',
  path: '/v1/chat/completions',
  tags: ['OpenAI Compatible'],
  summary: 'Create chat completion',
  description: 'Creates a model response for the given chat conversation. Compatible with OpenAI API format.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: ChatCompletionRequestSchema,
          examples: {
            basic: {
              summary: 'Basic message',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [{ role: 'user', content: 'Hello!' }],
              },
            },
            withSystem: {
              summary: 'With system prompt',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [
                  { role: 'system', content: 'You are a helpful assistant that speaks like a pirate.' },
                  { role: 'user', content: 'Tell me about the ocean.' },
                ],
              },
            },
            streaming: {
              summary: 'Streaming response',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [{ role: 'user', content: 'Write a short poem about coding.' }],
                stream: true,
              },
            },
            thinking: {
              summary: 'With extended thinking',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [{ role: 'user', content: 'Solve step by step: What is 847 * 239?' }],
                reasoning_effort: 'high',
                include_thoughts: true,
              },
            },
            multiTurn: {
              summary: 'Multi-turn conversation',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [
                  { role: 'user', content: 'My name is Alice.' },
                  { role: 'assistant', content: 'Hello Alice! Nice to meet you.' },
                  { role: 'user', content: 'What is my name?' },
                ],
              },
            },
            tools: {
              summary: 'With tool/function calling',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    description: 'Get the current weather in a given location',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: { type: 'string', description: 'City name' },
                      },
                      required: ['location'],
                    },
                  },
                }],
                tool_choice: 'auto',
              },
            },
            withImage: {
              summary: 'With image (base64)',
              value: {
                model: 'claude-sonnet-4-5',
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: { url: 'data:image/png;base64,<base64-encoded-image-data>' },
                    },
                    { type: 'text', text: 'What is in this image?' },
                  ],
                }],
              },
            },
            geminiFlash: {
              summary: 'Using Gemini Flash',
              value: {
                model: 'gemini-2.5-flash',
                messages: [{ role: 'user', content: 'Hello!' }],
              },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: ChatCompletionResponseSchema },
        'text/event-stream': { schema: z.any() },
      },
      description: 'Chat completion response (or SSE stream if stream=true)',
    },
    401: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Unauthorized - missing or invalid access token',
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Server error',
    },
  },
})

app.openapi(chatCompletionsRoute, async (c): Promise<Response> => {
  const apiKey = c.env.API_KEY
  if (apiKey) {
    const authHeader = c.req.header('Authorization')
    if (authHeader !== `Bearer ${apiKey}`) {
      return c.json({ error: 'Invalid API key' }, 401)
    }
  }

  const body = c.req.valid('json')

  if (!isValidModel(body.model)) {
    return c.json({ 
      error: { 
        message: `The model '${body.model}' does not exist`,
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_found'
      } 
    }, 404)
  }

  const result = await withTokenRotation(
    c.env.DB,
    {
      model: body.model,
      formatNoTokenError: () => c.json({ error: 'No valid token available', details: 'Set up token via /auth' }, 401) as unknown as Response,
      formatRateLimitError: (count) => c.json({ error: 'All accounts rate limited', details: count > 0 ? `Tried ${count} accounts` : undefined }, 429) as unknown as Response,
      formatAllExhaustedError: () => c.json({ error: 'All accounts exhausted' }, 429) as unknown as Response,
    },
    async (token: TokenInfo) => {
      if (body.stream) {
        const stream = await handleChatCompletionStream(body, token.accessToken, token.projectId)
        if (stream instanceof Response) return stream
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      }

      const completionResult = await handleChatCompletion(body, token.accessToken, token.projectId)
      if (completionResult instanceof Response) return completionResult
      return c.json(completionResult, 200) as unknown as Response
    }
  )

  return result as Response
})

const modelsListRoute = createRoute({
  method: 'get',
  path: '/v1/models',
  tags: ['OpenAI Compatible'],
  summary: 'List models',
  description: 'Lists the currently available models',
  responses: {
    200: {
      content: { 'application/json': { schema: ModelsListResponseSchema } },
      description: 'List of available models',
    },
  },
})

app.openapi(modelsListRoute, async (c) => {
  const result = listModels()
  return c.json(result, 200)
})

const modelRetrieveRoute = createRoute({
  method: 'get',
  path: '/v1/models/{model}',
  tags: ['OpenAI Compatible'],
  summary: 'Retrieve model',
  description: 'Retrieves a model instance',
  request: {
    params: z.object({
      model: z.string().openapi({ param: { name: 'model', in: 'path' }, example: 'gemini-2.5-flash' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({
        id: z.string(),
        object: z.literal('model'),
        created: z.number(),
        owned_by: z.string(),
      }) } },
      description: 'Model object',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Model not found',
    },
  },
})

app.openapi(modelRetrieveRoute, async (c) => {
  const { model } = c.req.valid('param')
  const result = getModel(model)
  if (!result) {
    return c.json({ error: 'Model not found', details: `Model '${model}' does not exist` }, 404)
  }
  return c.json(result, 200)
})

app.get('/', swaggerUI({ url: '/openapi.json' }))

app.get('/v1', (c) => c.redirect('/'))

const anthropicMessagesRoute = createRoute({
  method: 'post',
  path: '/v1/messages',
  tags: ['Anthropic Compatible'],
  summary: 'Create a message',
  description: 'Send messages to Claude models using Anthropic API format',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: AnthropicMessageRequestSchema,
          examples: {
            basic: {
              summary: 'Basic message',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [{ role: 'user', content: 'Hello!' }],
              },
            },
            withSystem: {
              summary: 'With system prompt',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                system: 'You are a helpful assistant that speaks like a pirate.',
                messages: [{ role: 'user', content: 'Tell me about the ocean.' }],
              },
            },
            thinking: {
              summary: 'With extended thinking',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 16384,
                messages: [{ role: 'user', content: 'Solve step by step: What is 847 * 239?' }],
                thinking: { type: 'enabled', budget_tokens: 8192 },
              },
            },
            streaming: {
              summary: 'Streaming response',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                stream: true,
                messages: [{ role: 'user', content: 'Write a short poem about coding.' }],
              },
            },
            multiTurn: {
              summary: 'Multi-turn conversation',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [
                  { role: 'user', content: 'My name is Alice.' },
                  { role: 'assistant', content: 'Hello Alice! Nice to meet you.' },
                  { role: 'user', content: 'What is my name?' },
                ],
              },
            },
            withTools: {
              summary: 'With tool use',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
                tools: [
                  {
                    name: 'get_weather',
                    description: 'Get the current weather in a given location',
                    input_schema: {
                      type: 'object',
                      properties: {
                        location: { type: 'string', description: 'City name' },
                      },
                      required: ['location'],
                    },
                  },
                ],
              },
            },
            withImage: {
              summary: 'With image (base64)',
              value: {
                model: 'claude-sonnet-4-5',
                max_tokens: 1024,
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: 'image/png',
                          data: '<base64-encoded-image-data>',
                        },
                      },
                      { type: 'text', text: 'What is in this image?' },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: AnthropicMessageResponseSchema },
        'text/event-stream': { schema: z.any() },
      },
      description: 'Message response (or SSE stream if stream=true)',
    },
    401: {
      content: { 'application/json': { schema: AnthropicErrorSchema } },
      description: 'Unauthorized',
    },
    400: {
      content: { 'application/json': { schema: AnthropicErrorSchema } },
      description: 'Bad request',
    },
  },
})

app.openapi(anthropicMessagesRoute, async (c): Promise<Response> => {
  const apiKey = c.env.API_KEY
  const authHeader = c.req.header('Authorization')
  const xApiKey = c.req.header('x-api-key')

  if (apiKey) {
    const providedKey = xApiKey ?? authHeader?.replace('Bearer ', '')
    if (providedKey !== apiKey) {
      return c.json({
        type: 'error',
        error: { type: 'authentication_error', message: 'Invalid API key' },
      }, 401)
    }
  }

  const body = c.req.valid('json')

  if (!isValidAnthropicModel(body.model)) {
    return c.json({
      type: 'error',
      error: { type: 'invalid_request_error', message: `Model '${body.model}' not found` },
    }, 400)
  }

  const result = await withTokenRotation(
    c.env.DB,
    {
      model: body.model,
      formatNoTokenError: () => c.json({
        type: 'error',
        error: { type: 'authentication_error', message: 'No valid token available' },
      }, 401) as unknown as Response,
      formatRateLimitError: (count) => c.json({
        type: 'error',
        error: { type: 'rate_limit_error', message: count > 0 ? `All ${count} accounts rate limited` : 'All accounts rate limited' },
      }, 429) as unknown as Response,
      formatAllExhaustedError: () => c.json({
        type: 'error',
        error: { type: 'rate_limit_error', message: 'All accounts exhausted' },
      }, 429) as unknown as Response,
    },
    async (token: TokenInfo) => {
      if (body.stream) {
        const stream = await handleAnthropicMessageStream(body, token.accessToken, token.projectId)
        if (stream instanceof Response) return stream
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      }

      const messageResult = await handleAnthropicMessage(body, token.accessToken, token.projectId)
      if (messageResult instanceof Response) return messageResult
      return c.json(messageResult, 200) as unknown as Response
    }
  )

  return result as Response
})

const adminAuth = createMiddleware<{ Bindings: Bindings }>(async (c, next) => {
  const adminKey = c.env.ADMIN_KEY
  if (adminKey && c.req.header('Authorization') !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

app.post('/admin/token', adminAuth, async (c) => {
  const body = await c.req.json<{
    refreshToken: string
    accessToken?: string
    projectId: string
    email: string
    expiresAt?: number
  }>()

  if (!body.refreshToken || !body.projectId || !body.email) {
    return c.json({ error: 'Missing refreshToken, projectId, or email' }, 400)
  }

  const token: StoredToken = {
    refreshToken: body.refreshToken,
    accessToken: body.accessToken ?? '',
    projectId: body.projectId,
    expiresAt: body.expiresAt ?? 0,
    email: body.email,
  }

  if (!token.accessToken || token.expiresAt < Date.now()) {
    const refreshed = await refreshAccessToken(body.refreshToken)
    token.accessToken = refreshed.accessToken
    token.expiresAt = refreshed.expiresAt
    if (refreshed.refreshToken) {
      token.refreshToken = refreshed.refreshToken
    }
  }

  await setStoredToken(c.env.DB, token)
  return c.json({ success: true, email: token.email, expiresAt: token.expiresAt })
})

app.get('/admin/token', adminAuth, async (c) => {
  const tokens = await getAllTokens(c.env.DB)
  if (tokens.length === 0) {
    return c.json({ error: 'No token stored' }, 404)
  }

  return c.json({ hasToken: true, count: tokens.length })
})

app.post('/admin/token/refresh', adminAuth, async (c) => {
  const result = await handleTokenRefresh(c.env.DB)
  if (!result.success) {
    return c.json({ error: result.errors.join(', ') }, 400)
  }

  return c.json({ success: true, refreshed: result.refreshed })
})

app.post('/admin/warmup', adminAuth, async (c) => {
  const results = await warmUpAllAccounts(c.env.DB)
  return c.json({ results })
})

app.delete('/admin/token', adminAuth, async (c) => {
  const email = c.req.query('email')
  if (!email) {
    return c.json({ error: 'Missing email parameter' }, 400)
  }

  await deleteStoredToken(c.env.DB, email)
  return c.json({ success: true })
})

app.get('/auth', async (c) => {
  return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)))
})

app.get('/admin/accounts', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  const isAdmin = !adminKey || authHeader === `Bearer ${adminKey}`

  const quotas = await getAllAccountsQuota(c.env.DB)

  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@')
    if (!domain) return email
    const masked = local.length <= 2 ? local[0] + '***' : local.slice(0, 2) + '***'
    return `${masked}@${domain}`
  }

  const quotaByEmail = Object.fromEntries(quotas.map((q) => [q.email, q]))

  if (isAdmin) {
    const tokens = await getAllTokens(c.env.DB)
    const accounts = tokens.map((t) => ({
      email: t.email,
      projectId: t.projectId,
      tier: t.tier,
      expiresAt: t.expiresAt,
      rateLimitUntil: t.rateLimitUntil,
      quota: quotaByEmail[t.email] || null,
    }))
    return c.json({ accounts, isAdmin, fetchedAt: Date.now() })
  }

  const accounts = quotas.map((q) => ({
    email: maskEmail(q.email),
    quota: q,
  }))
  return c.json({ accounts, isAdmin, fetchedAt: Date.now() })
})

app.post('/auth/callback', async (c) => {
  const body = await c.req.json<{
    code: string
    state: string
    redirectUri?: string
  }>()

  if (!body.code || !body.state) {
    return c.json({ error: 'Missing code or state' }, 400)
  }

  const result = await exchangeAntigravity(body.code, body.state, body.redirectUri)
  
  if (!result.email) {
    return c.json({ error: 'Failed to get email from Google' }, 400)
  }

  const token: StoredToken = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    projectId: result.projectId ?? '',
    expiresAt: result.expiresAt,
    email: result.email,
    tier: result.tier,
  }

  await setStoredToken(c.env.DB, token)
  return c.json({ success: true, projectId: token.projectId, email: token.email, tier: token.tier, expiresAt: token.expiresAt })
})

app.onError((err, c) => {
  const isDev = c.env.ENVIRONMENT === 'development'
  return c.json({ error: err.message, details: isDev ? err.stack : undefined }, 500)
})

app.notFound(async (c) => {
  return c.json({ error: 'Not found' }, 404)
})

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([
        handleTokenRefresh(env.DB).then((result) => {
          console.log('Token refresh result:', result)
        }),
        warmUpAllAccounts(env.DB).then((results) => {
          for (const r of results) {
            if (r.warmedUp.length > 0) {
              console.log(`Warmed up ${r.email}: ${r.warmedUp.join(', ')}`)
            }
            if (r.errors.length > 0) {
              console.log(`Warmup errors for ${r.email}:`, r.errors)
            }
          }
        }),
      ])
    )
  },
}

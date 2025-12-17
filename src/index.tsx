import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { z } from '@hono/zod-openapi'
import {
  SearchBodySchema,
  SearchResponseSchema,
  ErrorSchema,
} from './schemas'
import { authorizeAntigravity, exchangeAntigravity, refreshAccessToken } from './oauth'
import { executeSearch } from './search'
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
import { getValidAccessToken, setStoredToken, handleTokenRefresh, type StoredToken } from './storage'
import { AuthPage } from './auth-ui'

type Bindings = {
  ANTIGRAVITY_AUTH: KVNamespace
  ADMIN_KEY?: string
  API_KEY?: string
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

const searchRoute = createRoute({
  method: 'post',
  path: '/search',
  tags: ['Search'],
  summary: 'Execute Google Search',
  description: 'Search the web using Google Search via Antigravity API',
  request: {
    body: { content: { 'application/json': { schema: SearchBodySchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SearchResponseSchema } },
      description: 'Search results',
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Search API error',
    },
  },
})

app.openapi(searchRoute, async (c) => {
  const { query, urls, thinking, accessToken, projectId } = c.req.valid('json')
  const result = await executeSearch({ query, urls, thinking }, accessToken, projectId)
  return c.json(result, 200)
})

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'API Key for chat completions',
})

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Antigravity API',
    description: 'OpenAI-compatible API powered by Google Antigravity',
  },
  tags: [
    { name: 'OpenAI Compatible', description: 'OpenAI-compatible chat completions API' },
    { name: 'Search', description: 'Google Search endpoints' },
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
              summary: 'Basic',
              value: {
                model: 'gemini-3-pro-preview',
                messages: [{ role: 'user', content: 'Hello!' }],
              },
            },
            streaming: {
              summary: 'Streaming',
              value: {
                model: 'gemini-3-pro-preview',
                messages: [{ role: 'user', content: 'Hello!' }],
                stream: true,
              },
            },
            thinking: {
              summary: 'Thinking',
              value: {
                model: 'gemini-3-pro-preview',
                messages: [{ role: 'user', content: 'What is 25 * 37?' }],
                reasoning_effort: 'medium',
                include_thoughts: true,
              },
            },
            tools: {
              summary: 'Tools',
              value: {
                model: 'gemini-3-pro-preview',
                messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    description: 'Get weather in a location',
                    parameters: {
                      type: 'object',
                      properties: {
                        location: { type: 'string' },
                      },
                      required: ['location'],
                    },
                  },
                }],
                tool_choice: 'auto',
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

  const stored = await getValidAccessToken(c.env.ANTIGRAVITY_AUTH, body.model)
  if (!stored) {
    return c.json({ error: 'No valid token available', details: 'Set up token via /auth' }, 401)
  }
  const accessToken = stored.accessToken
  const projectId = stored.projectId
  const tokenEmail = stored.email

  try {
    if (body.stream) {
      const stream = await handleChatCompletionStream(body, accessToken, projectId)
      if (stream instanceof Response) return stream
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    const result = await handleChatCompletion(body, accessToken, projectId)
    if (result instanceof Response) return result
    return c.json(result, 200)
  } catch (e) {
    if (e instanceof Error && e.message.includes('429') && tokenEmail) {
      const { markRateLimited } = await import('./storage')
      await markRateLimited(c.env.ANTIGRAVITY_AUTH, tokenEmail, body.model, 60000)
    }
    throw e
  }
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

app.get('/swagger', swaggerUI({ url: '/doc' }))

app.post('/admin/token', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

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

  await setStoredToken(c.env.ANTIGRAVITY_AUTH, token)
  return c.json({ success: true, email: token.email, expiresAt: token.expiresAt })
})

app.get('/admin/token', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { getAllTokens } = await import('./storage')
  const tokens = await getAllTokens(c.env.ANTIGRAVITY_AUTH)
  if (tokens.length === 0) {
    return c.json({ error: 'No token stored' }, 404)
  }

  return c.json({ hasToken: true, count: tokens.length })
})

app.get('/admin/token/details', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { getAllTokens } = await import('./storage')
  const tokens = await getAllTokens(c.env.ANTIGRAVITY_AUTH)

  if (tokens.length === 0) {
    return c.json({ error: 'No tokens stored' }, 404)
  }

  return c.json({
    tokens: tokens.map(t => ({
      email: t.email,
      projectId: t.projectId,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      rateLimitUntil: t.rateLimitUntil,
      lastUsed: t.lastUsed,
    })),
  })
})

app.post('/admin/token/refresh', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const result = await handleTokenRefresh(c.env.ANTIGRAVITY_AUTH)
  if (!result.success) {
    return c.json({ error: result.errors.join(', ') }, 400)
  }

  return c.json({ success: true, refreshed: result.refreshed })
})

app.delete('/admin/token', async (c) => {
  const adminKey = c.env.ADMIN_KEY
  const authHeader = c.req.header('Authorization')
  
  if (adminKey && authHeader !== `Bearer ${adminKey}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const email = c.req.query('email')
  if (!email) {
    return c.json({ error: 'Missing email parameter' }, 400)
  }

  const { deleteStoredToken } = await import('./storage')
  await deleteStoredToken(c.env.ANTIGRAVITY_AUTH, email)
  return c.json({ success: true })
})

app.get('/auth', (c) => {
  return c.html(<AuthPage />)
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
  }

  await setStoredToken(c.env.ANTIGRAVITY_AUTH, token)
  return c.json({ success: true, projectId: token.projectId, email: token.email, expiresAt: token.expiresAt })
})

app.get('/', (c) => {
  return c.json({
    name: 'Antigravity API',
    version: '1.0.0',
    docs: '/swagger',
    openapi: '/doc',
  })
})

app.onError((err, c) => {
  return c.json({ error: err.message, details: err.stack }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(
      handleTokenRefresh(env.ANTIGRAVITY_AUTH).then((result) => {
        console.log('Token refresh result:', result)
      })
    )
  },
}

import { z } from '@hono/zod-openapi'

export const AuthorizeQuerySchema = z.object({
  redirectUri: z.string().url().optional().openapi({
    param: { name: 'redirectUri', in: 'query' },
    example: 'http://localhost:3000/callback',
    description: 'Custom redirect URI (optional)',
  }),
})

export const AuthorizeResponseSchema = z.object({
  url: z.string().url().openapi({ example: 'https://accounts.google.com/o/oauth2/v2/auth?...' }),
  verifier: z.string().openapi({ example: 'abc123xyz...' }),
  state: z.string().openapi({ example: 'eyJ2ZXJpZmllciI6...' }),
}).openapi('AuthorizeResponse')

export const ExchangeBodySchema = z.object({
  code: z.string().openapi({ example: '4/0AX4XfWh...' }),
  state: z.string().openapi({ example: 'eyJ2ZXJpZmllciI6...' }),
}).openapi('ExchangeRequest')

export const TokenResponseSchema = z.object({
  accessToken: z.string().openapi({ example: 'ya29.a0AX...' }),
  refreshToken: z.string().openapi({ example: '1//0g...' }),
  expiresAt: z.number().openapi({ example: 1700000000000 }),
  email: z.string().email().optional().openapi({ example: 'user@gmail.com' }),
  projectId: z.string().optional().openapi({ example: 'my-project-123' }),
}).openapi('TokenResponse')

export const RefreshBodySchema = z.object({
  refreshToken: z.string().openapi({ example: '1//0g...' }),
}).openapi('RefreshRequest')

export const RefreshResponseSchema = z.object({
  accessToken: z.string().openapi({ example: 'ya29.a0AX...' }),
  expiresAt: z.number().openapi({ example: 1700000000000 }),
  refreshToken: z.string().optional().openapi({ example: '1//0g...' }),
}).openapi('RefreshResponse')

export const SearchBodySchema = z.object({
  query: z.string().min(1).openapi({ example: 'What is the latest news about AI?' }),
  urls: z.array(z.string().url()).optional().openapi({ example: ['https://example.com/article'] }),
  thinking: z.boolean().optional().default(true).openapi({ example: true }),
  accessToken: z.string().openapi({ example: 'ya29.a0AX...' }),
  projectId: z.string().openapi({ example: 'my-project-123' }),
}).openapi('SearchRequest')

export const SearchResponseSchema = z.object({
  text: z.string().openapi({ example: '## Search Results\n\nHere are the latest...' }),
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().url(),
  })).openapi({ example: [{ title: 'AI News', url: 'https://example.com' }] }),
  searchQueries: z.array(z.string()).openapi({ example: ['latest AI news 2024'] }),
  urlsRetrieved: z.array(z.object({
    url: z.string().url(),
    status: z.string(),
  })).openapi({ example: [{ url: 'https://example.com', status: 'URL_RETRIEVAL_STATUS_SUCCESS' }] }),
}).openapi('SearchResponse')

export const ErrorSchema = z.object({
  error: z.string().openapi({ example: 'Invalid request' }),
  details: z.string().optional().openapi({ example: 'Missing required field: code' }),
}).openapi('Error')
